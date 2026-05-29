import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Signal, SignalKind } from '@react-perfscope/core'
import { severityForSignal, SEVERITY_COLOR } from './severity'

interface TimelineProps {
  signals: Signal[]
  duration: number
  onJump?: (signal: Signal) => void
}

const LANE_KINDS: SignalKind[] = [
  'long-task',
  'forced-reflow',
  'layout-shift',
  'render',
  'paint',
  'network',
]

interface PlottedSignal {
  signal: Signal
  // x in [0, 1] — fraction of duration
  startX: number
  // For events with duration: width as fraction; for instants: 0
  widthX: number
}

function signalTime(s: Signal): number | null {
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

function laneSignals(signals: Signal[], kind: SignalKind, duration: number): PlottedSignal[] {
  const safeDur = Math.max(duration, 1)
  const out: PlottedSignal[] = []
  for (const s of signals) {
    if (s.kind !== kind) continue
    const t = signalTime(s)
    if (t == null) continue
    const d = signalDuration(s)
    out.push({
      signal: s,
      startX: Math.max(0, Math.min(1, t / safeDur)),
      widthX: Math.max(0, Math.min(1 - t / safeDur, d / safeDur)),
    })
  }
  return out
}

const LANE_HEIGHT = 22
const LANE_GAP = 4
const LABEL_WIDTH = 80
const PADDING_X = 8
const PADDING_Y = 8

export function Timeline({ signals, duration, onJump }: TimelineProps) {
  const [hovered, setHovered] = useState<{ s: Signal; x: number; y: number } | null>(null)
  const presentLanes = LANE_KINDS.filter((k) => signals.some((s) => s.kind === k))
  const height = PADDING_Y * 2 + presentLanes.length * (LANE_HEIGHT + LANE_GAP)
  const safeDur = Math.max(duration, 1)

  // Tick marks every ~quarter of the duration, rounded to a nice number
  const ticks = useMemo(() => {
    const target = 5
    const raw = safeDur / target
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = Math.max(1, Math.round(raw / mag) * mag)
    const result: number[] = []
    for (let t = 0; t <= safeDur; t += step) result.push(t)
    return result
  }, [safeDur])

  if (presentLanes.length === 0) {
    return (
      <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>
        No time-bound signals to plot.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${100} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: `${height}px` }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Tick lines */}
        {ticks.map((t, i) => {
          const x = PADDING_X + ((t / safeDur) * (100 - PADDING_X - 2))
          return (
            <line
              key={`tick-${i}`}
              x1={x}
              x2={x}
              y1={PADDING_Y}
              y2={height - PADDING_Y}
              stroke="#222"
              strokeWidth="0.2"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {/* Lanes */}
        {presentLanes.map((kind, li) => {
          const laneY = PADDING_Y + li * (LANE_HEIGHT + LANE_GAP)
          const items = laneSignals(signals, kind, safeDur)
          return (
            <g key={kind} data-lane={kind}>
              <rect
                x={PADDING_X}
                y={laneY}
                width={100 - PADDING_X - 2}
                height={LANE_HEIGHT}
                fill="#161616"
                stroke="#202020"
                strokeWidth="0.2"
                vectorEffect="non-scaling-stroke"
              />
              {items.map((p, i) => {
                const sev = severityForSignal(p.signal)
                const color = SEVERITY_COLOR[sev]
                const fx = PADDING_X + p.startX * (100 - PADDING_X - 2)
                const fw = Math.max(0.4, p.widthX * (100 - PADDING_X - 2))
                return (
                  <rect
                    key={`${kind}-${i}`}
                    x={fx}
                    y={laneY + 4}
                    width={fw}
                    height={LANE_HEIGHT - 8}
                    fill={color}
                    opacity={sev === 'low' ? 0.6 : 0.85}
                    rx="1"
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
                      setHovered({ s: p.signal, x: rect.left + rect.width / 2, y: rect.top })
                    }}
                    onClick={() => onJump?.(p.signal)}
                    style={{ cursor: onJump ? 'pointer' : 'default' }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Lane labels (HTML overlay so text doesn't stretch with viewBox) */}
      <div
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
        }}
      >
        {presentLanes.map((kind, li) => {
          const top = PADDING_Y + li * (LANE_HEIGHT + LANE_GAP) + 3
          return (
            <div
              key={kind}
              style={{
                position: 'absolute',
                top: `${top}px`,
                left: '4px',
                fontSize: '10px',
                color: '#888',
                fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                lineHeight: `${LANE_HEIGHT - 6}px`,
                background: '#0d0d0d',
                padding: '0 4px',
                borderRadius: '3px',
              }}
            >
              {kind}
            </div>
          )
        })}
        {/* Tick labels along the bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: '-14px',
            left: '0',
            right: '0',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            color: '#666',
            padding: '0 8px',
            fontFamily: 'SF Mono, Menlo, Consolas, monospace',
          }}
        >
          <span>0</span>
          <span>{safeDur >= 1000 ? `${(safeDur / 1000).toFixed(1)}s` : `${safeDur.toFixed(0)}ms`}</span>
        </div>
      </div>

      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: `${hovered.x + 8}px`,
            top: `${hovered.y - 28}px`,
            background: '#0d0d0d',
            border: '1px solid #2a2a2a',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#e6e6e6',
            pointerEvents: 'none',
            zIndex: 2147483647,
            whiteSpace: 'nowrap',
          }}
        >
          <TooltipContent s={hovered.s} />
        </div>
      )}
    </div>
  )
}

function TooltipContent({ s }: { s: Signal }) {
  const sev = severityForSignal(s)
  const color = SEVERITY_COLOR[sev]
  switch (s.kind) {
    case 'long-task':
      return <span><strong>long-task</strong> <span style={{ color }}>{s.duration.toFixed(0)}ms</span> @ {s.at.toFixed(0)}ms</span>
    case 'forced-reflow':
      return <span><strong>forced-reflow</strong> <span style={{ color }}>{s.duration.toFixed(2)}ms</span> @ {s.at.toFixed(0)}ms</span>
    case 'layout-shift':
      return <span><strong>layout-shift</strong> <span style={{ color }}>{s.value.toFixed(3)}</span> @ {s.at.toFixed(0)}ms</span>
    case 'render':
      return <span><strong>{s.component}</strong> <span style={{ color }}>{s.duration.toFixed(2)}ms</span> @ {s.at.toFixed(0)}ms</span>
    case 'paint':
      return <span><strong>paint</strong> {s.cause} @ {s.at.toFixed(0)}ms</span>
    case 'network':
      return <span><strong>{s.url.slice(0, 40)}</strong> <span style={{ color }}>{s.duration.toFixed(0)}ms</span> @ {s.startedAt.toFixed(0)}ms</span>
    case 'web-vital':
      return null
  }
}
