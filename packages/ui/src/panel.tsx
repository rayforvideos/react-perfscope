import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { RecordingResult, Signal, SignalKind } from '@react-perfscope/core'
import type { WidgetPosition } from './types'

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
  for (const s of signals) {
    acc[s.kind].push(s)
  }
  return acc
}

function renderSignal(s: Signal): string {
  switch (s.kind) {
    case 'forced-reflow':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(2)}ms`
    case 'layout-shift':
      return `@ ${s.at.toFixed(1)}ms • value ${s.value.toFixed(3)} • ${s.sources.length} source(s)`
    case 'long-task':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(1)}ms`
    case 'paint':
      return `paint @ ${s.at.toFixed(1)}ms • ${s.cause}`
    case 'network':
      return `${s.url} • ${s.duration.toFixed(0)}ms • ${(s.size / 1024).toFixed(1)}KB${s.blocking ? ' • blocking' : ''}`
    case 'web-vital':
      return `${s.name}: ${s.value.toFixed(2)}`
    case 'render':
      return `${s.component} • ${s.reason} • ${s.duration.toFixed(2)}ms`
  }
}

export function Panel(props: PanelProps) {
  const { result, onClose } = props
  const grouped = useMemo(() => groupByKind(result.signals), [result.signals])
  const kindsPresent = KIND_ORDER.filter((k) => grouped[k].length > 0)
  const [activeKind, setActiveKind] = useState<SignalKind | null>(
    kindsPresent[0] ?? null
  )

  const panelStyle = {
    position: 'fixed' as const,
    bottom: '16px',
    right: '16px',
    width: '420px',
    maxHeight: '60vh',
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
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <strong>react-perfscope</strong>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#e6e6e6',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ×
        </button>
      </header>

      {kindsPresent.length === 0 && (
        <div style={{ color: '#888' }}>No signals recorded.</div>
      )}

      {kindsPresent.length > 0 && (
        <>
          <nav
            style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
              marginBottom: '8px',
            }}
          >
            {kindsPresent.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
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

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              overflowY: 'auto',
              flexGrow: 1,
            }}
          >
            {activeKind &&
              grouped[activeKind].map((s, i) => (
                <li
                  key={i}
                  style={{
                    padding: '6px 8px',
                    borderTop: '1px solid #1a1a1a',
                    fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                    fontSize: '11px',
                  }}
                >
                  {renderSignal(s)}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  )
}
