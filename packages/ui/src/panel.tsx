import { h } from 'preact'
import { useState, useMemo, useEffect, useRef } from 'preact/hooks'
import type {
  RecordingResult,
  Signal,
  SignalKind,
  ForcedReflowSignal,
  LayoutShiftSignal,
  LongTaskSignal,
  NetworkSignal,
  PaintSignal,
  RenderSignal,
  WebVitalSignal,
} from '@react-perfscope/core'
import type { WidgetPosition } from './types'
import { showOverlay, hideOverlay, hideAllOverlays } from './overlay'

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
}

const KIND_ORDER: SignalKind[] = [
  'forced-reflow',
  'layout-shift',
  'long-task',
  'paint',
  'network',
  'web-vital',
  'render',
]

const POSITION_STYLES: Record<WidgetPosition, Record<string, string>> = {
  'bottom-right': { bottom: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'top-left': { top: '16px', left: '16px' },
}

function groupByKind(signals: Signal[]): Record<SignalKind, Signal[]> {
  const acc = {
    'forced-reflow': [] as Signal[],
    'layout-shift': [] as Signal[],
    'long-task': [] as Signal[],
    'paint': [] as Signal[],
    'network': [] as Signal[],
    'web-vital': [] as Signal[],
    'render': [] as Signal[],
  } as Record<SignalKind, Signal[]>
  for (const s of signals) acc[s.kind].push(s)
  return acc
}

function summary(s: Signal): string {
  switch (s.kind) {
    case 'forced-reflow':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(2)}ms`
    case 'layout-shift':
      return `@ ${s.at.toFixed(1)}ms • value ${s.value.toFixed(3)} • ${s.sources.length} source(s)`
    case 'long-task':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(1)}ms`
    case 'paint':
      return `@ ${s.at.toFixed(1)}ms • ${s.cause}`
    case 'network':
      return `${s.url.length > 60 ? s.url.slice(0, 57) + '...' : s.url} • ${s.duration.toFixed(0)}ms${s.blocking ? ' • blocking' : ''}`
    case 'web-vital':
      return `${s.name}: ${s.value.toFixed(2)}`
    case 'render':
      return `${s.component} • ${s.reason} • ${s.duration.toFixed(2)}ms`
  }
}

const detailLabelStyle = { color: '#888', marginRight: '6px' } as const
const detailRowStyle = { padding: '2px 0', display: 'flex', gap: '6px' } as const
const monoStyle = {
  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
  fontSize: '11px',
} as const

function ForcedReflowDetail({ s }: { s: ForcedReflowSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      {s.stack.length === 0 ? (
        <div style={{ color: '#666' }}>No stack captured.</div>
      ) : (
        s.stack.slice(0, 8).map((f, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            {f.fnName ? <span>{f.fnName}</span> : <span style={{ color: '#666' }}>(anonymous)</span>}
            <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
          </div>
        ))
      )}
    </div>
  )
}

function LayoutShiftDetail({ s }: { s: LayoutShiftSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>value</span><span>{s.value.toFixed(4)}</span></div>
      {s.sources.length === 0 ? (
        <div style={{ color: '#666' }}>No source rects.</div>
      ) : (
        s.sources.map((r, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            <span style={{ color: '#888' }}>rect {i + 1}</span>
            <span>x={r.x.toFixed(0)} y={r.y.toFixed(0)} w={r.width.toFixed(0)} h={r.height.toFixed(0)}</span>
          </div>
        ))
      )}
    </div>
  )
}

function LongTaskDetail({ s }: { s: LongTaskSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>started</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>ended</span><span>{(s.at + s.duration).toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(2)}ms</span></div>
      {s.stack.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          {s.stack.slice(0, 5).map((f, i) => (
            <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
              {f.fnName && <span>{f.fnName}</span>}
              <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NetworkDetail({ s }: { s: NetworkSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={{ ...detailRowStyle, ...monoStyle, wordBreak: 'break-all' as const }}>
        <span>{s.url}</span>
      </div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>started</span><span>{s.startedAt.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>size</span><span>{(s.size / 1024).toFixed(2)}KB ({s.size} bytes)</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>render-blocking</span><span>{s.blocking ? 'yes' : 'no'}</span></div>
    </div>
  )
}

function PaintDetail({ s }: { s: PaintSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>at</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>cause</span><span>{s.cause}</span></div>
    </div>
  )
}

function WebVitalDetail({ s }: { s: WebVitalSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>metric</span><span>{s.name}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>value</span><span>{s.value.toFixed(2)}</span></div>
    </div>
  )
}

function RenderDetail({ s }: { s: RenderSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>component</span><span>{s.component}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>reason</span><span>{s.reason}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(3)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>at</span><span>{s.at.toFixed(2)}ms</span></div>
    </div>
  )
}

function SignalDetail({ s }: { s: Signal }) {
  switch (s.kind) {
    case 'forced-reflow': return <ForcedReflowDetail s={s} />
    case 'layout-shift': return <LayoutShiftDetail s={s} />
    case 'long-task': return <LongTaskDetail s={s} />
    case 'network': return <NetworkDetail s={s} />
    case 'paint': return <PaintDetail s={s} />
    case 'web-vital': return <WebVitalDetail s={s} />
    case 'render': return <RenderDetail s={s} />
  }
}

interface SignalRowProps {
  signal: Signal
  expanded: boolean
  onToggleExpand: () => void
  onHoverGeometry: (rects: DOMRect[] | null) => void
}

function SignalRow({ signal, expanded, onToggleExpand, onHoverGeometry }: SignalRowProps) {
  const hasGeometry = signal.kind === 'layout-shift' && signal.sources.length > 0
  return (
    <li
      aria-expanded={expanded}
      onClick={onToggleExpand}
      onMouseEnter={() => {
        if (hasGeometry && signal.kind === 'layout-shift') onHoverGeometry(signal.sources)
      }}
      onMouseLeave={() => {
        if (hasGeometry) onHoverGeometry(null)
      }}
      style={{
        padding: '6px 8px',
        borderTop: '1px solid #1a1a1a',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
        cursor: 'pointer',
        userSelect: 'none' as const,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#888', width: '10px' }}>{expanded ? '▼' : '▶'}</span>
        <span>{summary(signal)}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a' }}>
          <SignalDetail s={signal} />
        </div>
      )}
    </li>
  )
}

export function Panel(props: PanelProps) {
  const { result, onClose, position = 'bottom-right' } = props
  const grouped = useMemo(() => groupByKind(result.signals), [result.signals])
  const kindsPresent = KIND_ORDER.filter((k) => grouped[k].length > 0)
  const [activeKind, setActiveKind] = useState<SignalKind | null>(kindsPresent[0] ?? null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const activeOverlayCount = useRef(0)

  useEffect(() => () => hideAllOverlays(), [])

  function handleHover(rects: DOMRect[] | null) {
    if (!rects) {
      for (let i = 0; i < activeOverlayCount.current; i++) {
        hideOverlay(`signal-${i}`)
      }
      activeOverlayCount.current = 0
      return
    }
    rects.forEach((r, i) => showOverlay(`signal-${i}`, r))
    activeOverlayCount.current = rects.length
  }

  const panelStyle = {
    position: 'fixed' as const,
    ...POSITION_STYLES[position],
    width: '460px',
    maxHeight: '70vh',
    background: '#0d0d0d',
    color: '#e6e6e6',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    zIndex: '2147483647',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  }

  return (
    <div role="region" aria-label="react-perfscope panel" style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>react-perfscope</strong>
        <button type="button" aria-label="Close panel" onClick={onClose}
          style={{ background: 'transparent', color: '#e6e6e6', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
          ×
        </button>
      </header>

      {kindsPresent.length === 0 && (
        <div style={{ color: '#888' }}>No signals recorded.</div>
      )}

      {kindsPresent.length > 0 && (
        <>
          <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {kindsPresent.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => { setActiveKind(kind); setExpandedKey(null) }}
                style={{
                  background: activeKind === kind ? '#2a2a2a' : '#1a1a1a',
                  color: '#e6e6e6',
                  border: '1px solid #2a2a2a',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {kind} {grouped[kind].length}
              </button>
            ))}
          </nav>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flexGrow: 1 }}>
            {activeKind && grouped[activeKind].map((s, i) => {
              const key = `${activeKind}-${i}`
              return (
                <SignalRow
                  key={key}
                  signal={s}
                  expanded={expandedKey === key}
                  onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
                  onHoverGeometry={handleHover}
                />
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
