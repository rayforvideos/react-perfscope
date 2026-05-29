import { h, Fragment } from 'preact'
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Signal, SignalKind } from '@react-perfscope/core'
import { severityForSignal, SEVERITY_OVERLAY_COLOR } from './severity'
import { useI18n } from './i18n'

interface TimelineProps {
  signals: Signal[]
  /** Recording duration in ms. */
  duration: number
  /** Recording start time (performance.now() value). Used to convert
   *  absolute signal timestamps to recording-relative ones. */
  startedAt: number
  onJump?: (signal: Signal) => void
}

const LANE_ORDER: SignalKind[] = [
  'long-task',
  'forced-reflow',
  'layout-shift',
  'render',
  'paint',
  'network',
]

const LANE_LABELS: Record<SignalKind, string> = {
  'long-task': 'long-task',
  'forced-reflow': 'forced-reflow',
  'layout-shift': 'shift',
  'render': 'render',
  'paint': 'paint',
  'network': 'network',
  'web-vital': 'web-vital',
}

function signalAbsoluteTime(s: Signal): number | null {
  if (s.kind === 'web-vital') return null
  if (s.kind === 'network') return s.startedAt
  return s.at
}

function signalDuration(s: Signal): number {
  if (s.kind === 'long-task' || s.kind === 'forced-reflow' || s.kind === 'render' || s.kind === 'network') {
    return s.duration
  }
  return 0
}

function formatTime(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  if (ms >= 1) return `${ms.toFixed(0)}ms`
  return `${ms.toFixed(1)}ms`
}

function niceStep(span: number, target: number): number {
  const raw = Math.max(span, 1) / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  if (norm < 1.5) return 1 * mag
  if (norm < 3) return 2 * mag
  if (norm < 7) return 5 * mag
  return 10 * mag
}

// Ticks at "nice" absolute times that fall inside the [start, end] window.
function niceTicks(start: number, end: number, target = 5): number[] {
  const span = Math.max(end - start, 1)
  const step = niceStep(span, target)
  const first = Math.ceil(start / step) * step
  const ticks: number[] = []
  for (let t = first; t <= end + 1e-6; t += step) ticks.push(t)
  return ticks
}

const LANE_HEIGHT = 28
// Network requests fire in parallel and overlap in time, so a single row would
// stack them on top of each other. The network lane lays overlapping bars onto
// separate rows (a waterfall) and grows its height to fit.
const NET_BAR_H = 7
const NET_ROW_GAP = 3
// Per-row brightness steps for stacked network bars. Non-monotonic so adjacent
// rows always contrast, and it never lands back on the previous value.
const NET_ROW_BRIGHTNESS = [1, 0.78, 1.22, 0.9, 1.12]
// Wide enough for the longest lane label ("forced-reflow") plus its count
// badge, so every lane's track starts at the same x and 0.0ms lines up.
const LABEL_COL_WIDTH = 124
const AXIS_HEIGHT = 22
const TRACK_PAD_X = 4
const MIN_BAR_W = 6
const MARKER_D = 9
// Point events within this many ms of each other merge into one marker. An
// absolute time window (not a fraction of the recording) so a long recording
// doesn't over-merge events that are actually far apart — roughly one frame.
const CLUSTER_BIN_MS = 16
// Minimum horizontal density. When fitting the whole recording into the visible
// track would squeeze it below this, the track grows to a fixed pixel width and
// scrolls instead, so dense early bursts stay legible in long recordings.
const MIN_PX_PER_SEC = 80

interface Plotted {
  s: Signal
  // [0, 1] left position within the track
  startFrac: number
  // [0, 1] width within the track (0 for instants)
  widthFrac: number
}

function plotLane(
  signals: Signal[],
  kind: SignalKind,
  winStart: number,
  winEnd: number,
  startedAt: number,
): Plotted[] {
  const span = Math.max(winEnd - winStart, 1)
  const out: Plotted[] = []
  for (const s of signals) {
    if (s.kind !== kind) continue
    const tAbs = signalAbsoluteTime(s)
    if (tAbs == null) continue
    const t = tAbs - startedAt - winStart
    const d = signalDuration(s)
    const startFrac = Math.max(0, Math.min(1, t / span))
    const widthFrac = Math.max(0, Math.min(1 - startFrac, d / span))
    out.push({ s, startFrac, widthFrac })
  }
  return out
}

// Greedy waterfall packing: place each bar on the first row whose last bar ends
// (visually, in px, honoring MIN_BAR_W) before this one starts. Bars must be
// sorted by startFrac. Returns each bar's row index and the total row count so
// the lane can size itself. Lets overlapping parallel requests sit side-by-side
// on separate rows instead of hiding behind each other.
function packRows(bars: Plotted[], trackInnerPx: number): { rows: number[]; rowCount: number } {
  const GAP_PX = 2
  const rowEnds: number[] = []
  const rows: number[] = []
  for (const b of bars) {
    const startPx = b.startFrac * trackInnerPx
    const endPx = startPx + Math.max(MIN_BAR_W, b.widthFrac * trackInnerPx)
    let placed = -1
    for (let r = 0; r < rowEnds.length; r++) {
      if (startPx >= rowEnds[r]! + GAP_PX) {
        placed = r
        break
      }
    }
    if (placed === -1) {
      placed = rowEnds.length
      rowEnds.push(0)
    }
    rowEnds[placed] = endPx
    rows.push(placed)
  }
  return { rows, rowCount: Math.max(1, rowEnds.length) }
}

type Severity = 'low' | 'medium' | 'high'
const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }

interface PointCluster {
  startFrac: number
  count: number
  rep: Signal
  worst: Severity
  members: Signal[]
}

// Collapse the visual noise of many near-simultaneous point events (e.g. 58
// forced-reflows in a 5ms burst, or a whole component tree re-rendering in one
// commit) into a single marker carrying a count. Items wide enough to read as a
// duration bar are left alone; only point-like items within `binFrac` of each
// other are merged. `binFrac` is the caller's time window (CLUSTER_BIN_MS)
// expressed as a fraction of the recording, so merging tracks real elapsed time
// rather than a fixed slice of the bar — a long recording won't fuse events
// that are seconds apart. The representative signal is the worst-severity one so
// the marker color stays honest, and every merged signal is kept in `members`
// so the tooltip can list what actually happened (which components rendered).
function clusterLane(items: Plotted[], binFrac: number): { bars: Plotted[]; clusters: PointCluster[] } {
  const bars: Plotted[] = []
  const pts: Plotted[] = []
  for (const it of items) {
    if (it.widthFrac >= binFrac) bars.push(it)
    else pts.push(it)
  }
  pts.sort((a, b) => a.startFrac - b.startFrac)
  const clusters: PointCluster[] = []
  let i = 0
  while (i < pts.length) {
    const start = pts[i]!.startFrac
    let rep = pts[i]!.s
    let worst = severityForSignal(pts[i]!.s)
    let sum = 0
    let j = i
    const members: Signal[] = []
    while (j < pts.length && pts[j]!.startFrac - start <= binFrac) {
      const sev = severityForSignal(pts[j]!.s)
      if (SEV_RANK[sev] > SEV_RANK[worst]) {
        worst = sev
        rep = pts[j]!.s
      }
      members.push(pts[j]!.s)
      sum += pts[j]!.startFrac
      j++
    }
    clusters.push({ startFrac: sum / members.length, count: members.length, rep, worst, members })
    i = j
  }
  return { bars, clusters }
}

// Distinct component names in a render cluster, with how many times each
// rendered, ordered by first appearance — drives the tooltip breakdown so a
// single marker can tell you the whole commit rendered App, Counter, ….
function renderBreakdown(members: Signal[]): { component: string; count: number }[] {
  const order: string[] = []
  const counts = new Map<string, number>()
  for (const s of members) {
    if (s.kind !== 'render') continue
    if (!counts.has(s.component)) order.push(s.component)
    counts.set(s.component, (counts.get(s.component) ?? 0) + 1)
  }
  return order.map((c) => ({ component: c, count: counts.get(c)! }))
}

export function Timeline({ signals, duration, startedAt, onJump }: TimelineProps) {
  const { t } = useI18n()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  // Cursor line left in px, measured from the track's real geometry so it
  // lands exactly on the bars (the label column's rendered width can differ
  // from LABEL_COL_WIDTH, so a hardcoded offset would drift).
  const [cursorLeftPx, setCursorLeftPx] = useState<number | null>(null)
  const [hovered, setHovered] = useState<{
    s: Signal
    clientX: number
    clientY: number
    count?: number
    members?: Signal[]
  } | null>(null)
  const [cursorFrac, setCursorFrac] = useState<number | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null)
  // Visible track width (container minus the sticky label column). Drives
  // whether the recording fits or needs to scroll horizontally.
  const [viewportTrackWidth, setViewportTrackWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setViewportTrackWidth(Math.max(0, el.clientWidth - LABEL_COL_WIDTH))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Position the tooltip after it renders so it never spills off-screen. The
  // panel commonly sits at the right edge, so anchoring a fixed nowrap tooltip
  // to the right of a bar would clip it. We measure the rendered tooltip, then
  // flip it to the left and clamp vertically as needed.
  useLayoutEffect(() => {
    if (!hovered) {
      setTipPos(null)
      return
    }
    const el = tipRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 10
    let left = hovered.clientX + gap
    if (left + r.width + 8 > vw) left = hovered.clientX - r.width - gap
    if (left < 8) left = Math.max(8, Math.min(vw - r.width - 8, hovered.clientX - r.width / 2))
    let top = hovered.clientY - r.height - 6
    if (top < 8) top = hovered.clientY + 18
    if (top + r.height + 8 > vh) top = Math.max(8, vh - r.height - 8)
    setTipPos({ left, top })
  }, [hovered])

  const presentLanes = useMemo(
    () => LANE_ORDER.filter((k) => signals.some((s) => s.kind === k)),
    [signals],
  )

  // The axis spans the whole recording: 0 (start) to its full duration (stop).
  const winStart = 0
  const winEnd = Math.max(duration, 1)
  const safeDur = winEnd
  const ticks = useMemo(() => niceTicks(winStart, winEnd), [winStart, winEnd])

  // Grow the track to a fixed pixel width (and scroll) when fitting the whole
  // recording would drop below MIN_PX_PER_SEC; otherwise fit the viewport.
  const neededTrackWidth = (safeDur / 1000) * MIN_PX_PER_SEC
  const trackWidth = Math.max(viewportTrackWidth, neededTrackWidth)
  const scrolls = viewportTrackWidth > 0 && trackWidth > viewportTrackWidth + 0.5

  if (presentLanes.length === 0) {
    return (
      <div style={{ color: '#888', padding: '20px', textAlign: 'center', fontSize: '11px' }}>
        {t.noTimeBound}
      </div>
    )
  }

  function handleMouseMove(e: MouseEvent) {
    const track = trackRef.current
    const content = contentRef.current
    if (!track || !content) return
    const rect = track.getBoundingClientRect()
    const inner = rect.width - 2 * TRACK_PAD_X
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - TRACK_PAD_X) / inner))
    setCursorFrac(frac)
    // Cursor line lives inside the (possibly scrolled) content div, so measure
    // its left in content-local coordinates — scrolling shifts track and content
    // together, keeping this offset stable.
    const contLeft = content.getBoundingClientRect().left
    setCursorLeftPx(rect.left - contLeft + TRACK_PAD_X + inner * frac)
  }
  function handleMouseLeave() {
    setCursorFrac(null)
    setCursorLeftPx(null)
    setHovered(null)
  }

  const cursorTime = cursorFrac != null ? winStart + cursorFrac * safeDur : null

  return (
    <div
      style={{
        userSelect: 'none',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
      }}
    >
      {/* Lane rows */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          overflowX: scrolls ? 'auto' : 'visible',
          // overflow-x:auto forces overflow-y to auto too, which would clip the
          // cursor time label sitting at top:-14px — reserve that space.
          paddingTop: scrolls ? '14px' : 0,
        }}
      >
      <div
        ref={contentRef}
        style={{
          position: 'relative',
          width: scrolls ? `${LABEL_COL_WIDTH + trackWidth}px` : '100%',
        }}
      >
        {/* Cursor line — drawn across all lanes when hovering */}
        {cursorFrac != null && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${cursorLeftPx ?? 0}px`,
              width: '1px',
              background: '#3b82f680',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}
        {cursorFrac != null && cursorTime != null && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-14px',
              left: `${cursorLeftPx ?? 0}px`,
              transform:
                cursorFrac < 0.06
                  ? 'translateX(0)'
                  : cursorFrac > 0.94
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
              fontSize: '10px',
              color: '#3b82f6',
              background: '#0d0d0d',
              padding: '0 4px',
              borderRadius: '3px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            {formatTime(cursorTime)}
          </div>
        )}
        {presentLanes.map((kind, li) => {
          const items = plotLane(signals, kind, winStart, winEnd, startedAt)
          const { bars, clusters } = clusterLane(items, CLUSTER_BIN_MS / safeDur)
          const altBg = li % 2 === 0 ? '#131313' : '#161616'
          // Network bars overlap (parallel requests), so pack them onto stacked
          // rows and grow the lane to fit. Other lanes keep the single-row layout.
          const isNet = kind === 'network'
          const trackInner = Math.max(1, trackWidth - 2 * TRACK_PAD_X)
          let laneBars = bars
          let barRows: number[] = []
          let laneHeight = LANE_HEIGHT
          if (isNet && bars.length > 0) {
            laneBars = [...bars].sort((a, b) => a.startFrac - b.startFrac)
            const packed = packRows(laneBars, trackInner)
            barRows = packed.rows
            laneHeight = Math.max(LANE_HEIGHT, packed.rowCount * (NET_BAR_H + NET_ROW_GAP) + NET_ROW_GAP)
          }
          return (
            <div
              key={kind}
              data-lane={kind}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                height: `${laneHeight}px`,
                background: altBg,
                borderBottom: '1px solid #1c1c1c',
              }}
            >
              {/* Lane label — pinned left so the lane stays identifiable while
                  the track scrolls horizontally. */}
              <div
                style={{
                  flex: `0 0 ${LABEL_COL_WIDTH}px`,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  position: 'sticky',
                  left: 0,
                  zIndex: 5,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                  color: '#9a9a9a',
                  borderRight: '1px solid #1c1c1c',
                  background: '#0f0f0f',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {LANE_LABELS[kind]}
                </span>
                <span style={{ color: '#555', fontSize: '10px', marginLeft: '4px' }}>{items.length}</span>
              </div>

              {/* Track */}
              <div
                ref={li === 0 ? trackRef : undefined}
                style={{
                  flex: scrolls ? '0 0 auto' : 1,
                  width: scrolls ? `${trackWidth}px` : undefined,
                  position: 'relative',
                  padding: `0 ${TRACK_PAD_X}px`,
                }}
              >
                {/* Tick guide lines */}
                {ticks.map((t, ti) => {
                  const leftPct = ((t - winStart) / safeDur) * 100
                  return (
                    <div
                      key={`tg-${ti}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `calc(${TRACK_PAD_X}px + (100% - ${2 * TRACK_PAD_X}px) * ${leftPct / 100})`,
                        width: '1px',
                        background: '#1f1f1f',
                      }}
                    />
                  )
                })}

                {/* Duration bars — wide enough to read as a real interval.
                    Network bars sit on packed rows (waterfall); others span the
                    lane vertically. */}
                {laneBars.map((p, i) => {
                  const sev = severityForSignal(p.s)
                  const color = SEVERITY_OVERLAY_COLOR[sev]
                  const isHot = hovered?.s === p.s
                  const baseOpacity = sev === 'low' ? 0.85 : sev === 'medium' ? 0.95 : 1
                  const glow =
                    sev === 'high' ? `0 0 8px ${color}cc, 0 0 0 1px ${color}` : `0 0 0 1px ${color}`
                  const row = isNet ? (barRows[i] ?? 0) : 0
                  const barTop = isNet ? `${NET_ROW_GAP + row * (NET_BAR_H + NET_ROW_GAP)}px` : '6px'
                  // Stacked network bars often share a severity (same hue), so step
                  // brightness per row to keep neighbours distinguishable without
                  // losing the severity colour meaning.
                  const netBrightness = isNet ? NET_ROW_BRIGHTNESS[row % NET_ROW_BRIGHTNESS.length]! : 1
                  return (
                    <div
                      key={`bar-${kind}-${i}`}
                      data-bar={kind}
                      onMouseEnter={(e: MouseEvent) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setHovered({ s: p.s, clientX: r.left + r.width / 2, clientY: r.top })
                      }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => onJump?.(p.s)}
                      title={formatTime((signalAbsoluteTime(p.s) ?? startedAt) - startedAt)}
                      style={{
                        position: 'absolute',
                        top: barTop,
                        bottom: isNet ? undefined : '6px',
                        height: isNet ? `${NET_BAR_H}px` : undefined,
                        left: `clamp(${TRACK_PAD_X}px, calc(${TRACK_PAD_X}px + (100% - ${2 * TRACK_PAD_X}px) * ${p.startFrac.toFixed(4)}), calc(100% - ${MIN_BAR_W + TRACK_PAD_X}px))`,
                        width: `min(calc(100% - ${2 * TRACK_PAD_X}px), max(${MIN_BAR_W}px, calc((100% - ${2 * TRACK_PAD_X}px) * ${p.widthFrac.toFixed(4)})))`,
                        background: `linear-gradient(180deg, ${color}, ${color}cc)`,
                        opacity: isHot ? 1 : baseOpacity,
                        borderRadius: '3px',
                        boxShadow: isHot ? `0 0 10px ${color}, 0 0 0 1px #fff6` : glow,
                        cursor: onJump ? 'pointer' : 'default',
                        transition: 'transform 90ms ease, box-shadow 90ms ease',
                        transform: isHot ? 'scaleY(1.18)' : 'scaleY(1)',
                        filter: isNet ? `brightness(${netBrightness})` : undefined,
                        zIndex: isHot ? 3 : 2,
                      }}
                    />
                  )
                })}

                {/* Point clusters — instant events, merged when they pile up.
                    Marker grows with the count so a busy burst reads as one
                    bigger dot, and a donut ring marks count > 1. */}
                {clusters.map((c, i) => {
                  const color = SEVERITY_OVERLAY_COLOR[c.worst]
                  const leftPct = c.startFrac * 100
                  const isHot = hovered?.s === c.rep
                  const baseOpacity = c.worst === 'low' ? 0.85 : c.worst === 'medium' ? 0.95 : 1
                  const d = MARKER_D + Math.min(6, Math.log2(c.count) * 1.6)
                  const glow =
                    c.worst === 'high'
                      ? `0 0 8px ${color}cc, 0 0 0 1px ${color}`
                      : `0 0 0 1px ${color}`
                  const ring = c.count > 1 ? `, inset 0 0 0 1.5px #0d0d0d` : ''
                  const markerLeft = `clamp(${d / 2}px, calc(${TRACK_PAD_X}px + (100% - ${2 * TRACK_PAD_X}px) * ${c.startFrac.toFixed(4)}), calc(100% - ${d / 2}px))`
                  // Flip the count badge to the left of the dot near the right
                  // edge so it never spills out of the track.
                  const badgeFlip = c.startFrac > 0.85
                  return (
                    <Fragment key={`pt-${kind}-${i}`}>
                      <div
                        data-bar={kind}
                        onMouseEnter={(e: MouseEvent) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setHovered({
                            s: c.rep,
                            clientX: r.left + r.width / 2,
                            clientY: r.top,
                            count: c.count,
                            members: c.members,
                          })
                        }}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onJump?.(c.rep)}
                        title={formatTime((signalAbsoluteTime(c.rep) ?? startedAt) - startedAt)}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: markerLeft,
                          width: `${d}px`,
                          height: `${d}px`,
                          marginLeft: `-${d / 2}px`,
                          transform: isHot ? 'translateY(-50%) scale(1.35)' : 'translateY(-50%)',
                          background: color,
                          opacity: isHot ? 1 : baseOpacity,
                          borderRadius: '50%',
                          boxShadow: (isHot ? `0 0 8px ${color}, 0 0 0 1px ${color}` : glow) + ring,
                          cursor: onJump ? 'pointer' : 'default',
                          transition: 'transform 90ms ease, box-shadow 90ms ease',
                          zIndex: isHot ? 3 : 2,
                        }}
                      />
                      {c.count > 1 && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: markerLeft,
                            marginLeft: badgeFlip ? `-${d / 2 + 3}px` : `${d / 2 + 3}px`,
                            transform: badgeFlip ? 'translate(-100%, -50%)' : 'translateY(-50%)',
                            fontSize: '9px',
                            fontWeight: 600,
                            lineHeight: 1,
                            color: '#e8e8e8',
                            background: '#0d0d0dcc',
                            padding: '1px 3px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            zIndex: isHot ? 4 : 3,
                          }}
                        >
                          ×{c.count}
                        </span>
                      )}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Time axis */}
        <div
          style={{
            display: 'flex',
            height: `${AXIS_HEIGHT}px`,
            background: '#0f0f0f',
            color: '#666',
            fontSize: '10px',
          }}
        >
          <div
            style={{
              flex: `0 0 ${LABEL_COL_WIDTH}px`,
              minWidth: 0,
              boxSizing: 'border-box',
              position: 'sticky',
              left: 0,
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 8px',
              borderRight: '1px solid #1c1c1c',
              background: '#0f0f0f',
              color: '#555',
            }}
          >
            {t.timeAxis}
          </div>
          <div
            style={{
              flex: scrolls ? '0 0 auto' : 1,
              width: scrolls ? `${trackWidth}px` : undefined,
              position: 'relative',
              padding: `0 ${TRACK_PAD_X}px`,
            }}
          >
            {ticks.map((t, ti) => {
              const leftPct = ((t - winStart) / safeDur) * 100
              const align =
                leftPct < 6 ? 'translateX(0)' : leftPct > 94 ? 'translateX(-100%)' : 'translateX(-50%)'
              return (
                <Fragment key={`tl-${ti}`}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      height: '4px',
                      width: '1px',
                      background: '#444',
                      left: `calc(${TRACK_PAD_X}px + (100% - ${2 * TRACK_PAD_X}px) * ${leftPct / 100})`,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '5px',
                      left: `calc(${TRACK_PAD_X}px + (100% - ${2 * TRACK_PAD_X}px) * ${leftPct / 100})`,
                      transform: align,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTime(t)}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>

      </div>

      {hovered && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            // Until measured, park at the origin (hidden) so the un-flipped
            // nowrap box can't overflow the viewport right edge and flash a
            // scrollbar. useLayoutEffect then flips/clamps and reveals it.
            left: `${tipPos ? tipPos.left : 0}px`,
            top: `${tipPos ? tipPos.top : 0}px`,
            visibility: tipPos ? 'visible' : 'hidden',
            background: '#0d0d0d',
            border: '1px solid #2a2a2a',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#e6e6e6',
            pointerEvents: 'none',
            zIndex: 2147483647,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {hovered.s.kind === 'render' && hovered.members && hovered.count && hovered.count > 1 ? (
            <RenderClusterTip
              members={hovered.members}
              count={hovered.count}
              s={hovered.s}
              startedAt={startedAt}
            />
          ) : (
            <Fragment>
              <TooltipContent s={hovered.s} startedAt={startedAt} />
              {hovered.count != null && hovered.count > 1 && (
                <span style={{ color: '#888', marginLeft: '6px' }}>×{hovered.count}</span>
              )}
            </Fragment>
          )}
        </div>
      )}
    </div>
  )
}

const BREAKDOWN_MAX = 6

function RenderClusterTip({
  members,
  count,
  s,
  startedAt,
}: {
  members: Signal[]
  count: number
  s: Signal
  startedAt: number
}) {
  const tAbs = signalAbsoluteTime(s)
  const at = tAbs == null ? '' : `@ ${formatTime(tAbs - startedAt)}`
  const bd = renderBreakdown(members)
  const shown = bd.slice(0, BREAKDOWN_MAX)
  const more = bd.length - shown.length
  return (
    <Fragment>
      <div>
        <strong>{count} renders</strong> <span style={{ color: '#888' }}>{at}</span>
      </div>
      <div style={{ color: '#9a9a9a', marginTop: '2px' }}>
        {shown.map((b, i) => (
          <span key={b.component}>
            {i > 0 ? ' · ' : ''}
            {b.component}
            {b.count > 1 ? ` ×${b.count}` : ''}
          </span>
        ))}
        {more > 0 ? ` · +${more}` : ''}
      </div>
    </Fragment>
  )
}

function TooltipContent({ s, startedAt }: { s: Signal; startedAt: number }) {
  const sev = severityForSignal(s)
  const color = SEVERITY_OVERLAY_COLOR[sev]
  const tAbs = signalAbsoluteTime(s)
  const t = tAbs == null ? null : tAbs - startedAt
  const at = t == null ? '' : `@ ${formatTime(t)}`
  switch (s.kind) {
    case 'long-task':
      return <span><strong>long-task</strong> <span style={{ color }}>{s.duration.toFixed(0)}ms</span> {at}</span>
    case 'forced-reflow':
      return <span><strong>forced-reflow</strong> <span style={{ color }}>{s.duration.toFixed(2)}ms</span> {at}</span>
    case 'layout-shift':
      return <span><strong>layout-shift</strong> <span style={{ color }}>{s.value.toFixed(3)}</span> {at}</span>
    case 'render':
      return <span><strong>{s.component}</strong> <span style={{ color }}>{s.duration.toFixed(2)}ms</span> {at}</span>
    case 'paint':
      return <span><strong>paint</strong> {s.cause} {at}</span>
    case 'network':
      return <span><strong>{s.url.slice(0, 40)}</strong> <span style={{ color }}>{s.duration.toFixed(0)}ms</span> {at}</span>
    case 'web-vital':
      return null
  }
}
