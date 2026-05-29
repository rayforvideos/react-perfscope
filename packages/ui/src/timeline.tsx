import { h, Fragment } from 'preact'
import { useMemo, useRef, useState } from 'preact/hooks'
import type { Signal, SignalKind } from '@react-perfscope/core'
import { severityForSignal, SEVERITY_OVERLAY_COLOR } from './severity'

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

function niceTicks(duration: number, target = 5): number[] {
  const safe = Math.max(duration, 1)
  const raw = safe / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let step: number
  if (norm < 1.5) step = 1 * mag
  else if (norm < 3) step = 2 * mag
  else if (norm < 7) step = 5 * mag
  else step = 10 * mag
  const ticks: number[] = []
  for (let t = 0; t <= safe + 1e-6; t += step) ticks.push(t)
  return ticks
}

const LANE_HEIGHT = 28
const LABEL_COL_WIDTH = 76
const AXIS_HEIGHT = 22
const TRACK_PAD_X = 4
const MIN_BAR_W = 6

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
  duration: number,
  startedAt: number,
): Plotted[] {
  const safe = Math.max(duration, 1)
  const out: Plotted[] = []
  for (const s of signals) {
    if (s.kind !== kind) continue
    const tAbs = signalAbsoluteTime(s)
    if (tAbs == null) continue
    const t = tAbs - startedAt
    const d = signalDuration(s)
    const startFrac = Math.max(0, Math.min(1, t / safe))
    const widthFrac = Math.max(0, Math.min(1 - startFrac, d / safe))
    out.push({ s, startFrac, widthFrac })
  }
  return out
}

export function Timeline({ signals, duration, startedAt, onJump }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState<{ s: Signal; clientX: number; clientY: number } | null>(null)
  const [cursorFrac, setCursorFrac] = useState<number | null>(null)

  const presentLanes = useMemo(
    () => LANE_ORDER.filter((k) => signals.some((s) => s.kind === k)),
    [signals],
  )

  // Trim trailing idle. If the user finished interacting well before they
  // stopped recording, most of the timeline would be dead space and every
  // event would be squished into a thin band on the left. We trim to
  // `lastEventEnd + 10%` so the meaningful window expands to fill.
  const trimmedDur = useMemo(() => {
    let last = 0
    for (const s of signals) {
      const tAbs = signalAbsoluteTime(s)
      if (tAbs == null) continue
      const t = tAbs - startedAt
      const end = t + signalDuration(s)
      if (end > last) last = end
    }
    if (last <= 0) return Math.max(duration, 1)
    return Math.min(duration, last * 1.1)
  }, [signals, duration, startedAt])
  const safeDur = Math.max(trimmedDur, 1)
  const trimmed = trimmedDur < duration * 0.95
  const ticks = useMemo(() => niceTicks(safeDur), [safeDur])

  if (presentLanes.length === 0) {
    return (
      <div style={{ color: '#888', padding: '20px', textAlign: 'center', fontSize: '11px' }}>
        No time-bound signals to plot.
      </div>
    )
  }

  function handleMouseMove(e: MouseEvent) {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const x = e.clientX - rect.left
    setCursorFrac(Math.max(0, Math.min(1, x / rect.width)))
  }
  function handleMouseLeave() {
    setCursorFrac(null)
    setHovered(null)
  }

  const cursorTime = cursorFrac != null ? cursorFrac * safeDur : null

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
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative' }}
      >
        {/* Cursor line — drawn across all lanes when hovering */}
        {cursorFrac != null && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `calc(${LABEL_COL_WIDTH}px + (100% - ${LABEL_COL_WIDTH}px) * ${cursorFrac})`,
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
              left: `calc(${LABEL_COL_WIDTH}px + (100% - ${LABEL_COL_WIDTH}px) * ${cursorFrac})`,
              transform: 'translateX(-50%)',
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
          const items = plotLane(signals, kind, safeDur, startedAt)
          const altBg = li % 2 === 0 ? '#131313' : '#161616'
          return (
            <div
              key={kind}
              data-lane={kind}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                height: `${LANE_HEIGHT}px`,
                background: altBg,
                borderBottom: '1px solid #1c1c1c',
              }}
            >
              {/* Lane label */}
              <div
                style={{
                  flex: `0 0 ${LABEL_COL_WIDTH}px`,
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
                  flex: 1,
                  position: 'relative',
                  padding: `0 ${TRACK_PAD_X}px`,
                }}
              >
                {/* Tick guide lines */}
                {ticks.map((t, ti) => {
                  const leftPct = (t / safeDur) * 100
                  return (
                    <div
                      key={`tg-${ti}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `calc(${leftPct}% + ${TRACK_PAD_X}px)`,
                        width: '1px',
                        background: ti === 0 || ti === ticks.length - 1 ? 'transparent' : '#1f1f1f',
                      }}
                    />
                  )
                })}

                {/* Bars */}
                {items.map((p, i) => {
                  const sev = severityForSignal(p.s)
                  const color = SEVERITY_OVERLAY_COLOR[sev]
                  const isInstant = p.widthFrac === 0
                  const leftPct = p.startFrac * 100
                  const widthCss = isInstant
                    ? `${MIN_BAR_W}px`
                    : `max(${MIN_BAR_W}px, ${(p.widthFrac * 100).toFixed(3)}%)`
                  return (
                    <div
                      key={`${kind}-${i}`}
                      onMouseEnter={(e) =>
                        setHovered({
                          s: p.s,
                          clientX: (e.currentTarget as HTMLElement).getBoundingClientRect().left,
                          clientY: (e.currentTarget as HTMLElement).getBoundingClientRect().top,
                        })
                      }
                      onClick={() => onJump?.(p.s)}
                      title={formatTime((signalAbsoluteTime(p.s) ?? startedAt) - startedAt)}
                      style={{
                        position: 'absolute',
                        top: '6px',
                        bottom: '6px',
                        left: `calc(${leftPct}% + ${TRACK_PAD_X}px)`,
                        width: widthCss,
                        background: color,
                        opacity: sev === 'low' ? 0.85 : sev === 'medium' ? 0.95 : 1,
                        borderRadius: isInstant ? '50%' : '3px',
                        boxShadow:
                          sev === 'high' ? `0 0 8px ${color}cc, 0 0 0 1px ${color}` : `0 0 0 1px ${color}`,
                        cursor: onJump ? 'pointer' : 'default',
                        transition: 'transform 80ms ease',
                      }}
                    />
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 8px',
              borderRight: '1px solid #1c1c1c',
              color: '#555',
            }}
          >
            {trimmed ? 'time·' : 'time'}
          </div>
          <div style={{ flex: 1, position: 'relative', padding: `0 ${TRACK_PAD_X}px` }}>
            {ticks.map((t, ti) => {
              const leftPct = (t / safeDur) * 100
              return (
                <Fragment key={`tl-${ti}`}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      height: '4px',
                      width: '1px',
                      background: '#444',
                      left: `calc(${leftPct}% + ${TRACK_PAD_X}px)`,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '5px',
                      left: `calc(${leftPct}% + ${TRACK_PAD_X}px)`,
                      transform:
                        ti === 0
                          ? 'translateX(0)'
                          : ti === ticks.length - 1
                          ? 'translateX(-100%)'
                          : 'translateX(-50%)',
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

      {hovered && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: `${hovered.clientX + 12}px`,
            top: `${hovered.clientY - 30}px`,
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
          <TooltipContent s={hovered.s} startedAt={startedAt} />
        </div>
      )}
    </div>
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
