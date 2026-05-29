import { h } from 'preact'
import type { RenderSignal } from '@react-perfscope/core'
import { severityForSignal, SEVERITY_COLOR } from './severity'
import { useI18n } from './i18n'

interface RenderInsightsProps {
  signals: RenderSignal[]
  onSelect?: (component: string) => void
}

interface Aggregate {
  component: string
  count: number
  totalMs: number
  maxMs: number
  worstSeverity: 'low' | 'medium' | 'high'
}

function aggregate(signals: RenderSignal[]): Aggregate[] {
  const byName = new Map<string, RenderSignal[]>()
  for (const s of signals) {
    if (!byName.has(s.component)) byName.set(s.component, [])
    byName.get(s.component)!.push(s)
  }
  const result: Aggregate[] = []
  for (const [name, list] of byName) {
    let total = 0
    let max = 0
    let worst: 'low' | 'medium' | 'high' = 'low'
    for (const s of list) {
      total += s.duration
      if (s.duration > max) max = s.duration
      const sev = severityForSignal(s)
      if (sev === 'high' || (sev === 'medium' && worst === 'low')) worst = sev
    }
    result.push({ component: name, count: list.length, totalMs: total, maxMs: max, worstSeverity: worst })
  }
  result.sort((a, b) => b.totalMs - a.totalMs)
  return result
}

const TOP_N = 5

export function RenderInsights({ signals, onSelect }: RenderInsightsProps) {
  const { t } = useI18n()
  if (signals.length === 0) return null
  const rows = aggregate(signals)
  const top = rows.slice(0, TOP_N)
  const max = top.length > 0 ? top[0]!.totalMs : 1
  const hiddenCount = rows.length - top.length

  return (
    <div
      style={{
        marginBottom: '8px',
        padding: '8px 10px',
        background: '#141414',
        border: '1px solid #1f1f1f',
        borderRadius: '8px',
      }}
    >
      <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
        {t.topRenderers}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {top.map((a) => {
          const widthPct = max > 0 ? Math.max(2, (a.totalMs / max) * 100) : 0
          const color = SEVERITY_COLOR[a.worstSeverity]
          return (
            <div
              key={a.component}
              data-component={a.component}
              onClick={() => onSelect?.(a.component)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                cursor: onSelect ? 'pointer' : 'default',
                padding: '3px 0',
              }}
              title={`${a.component} · ${a.count} renders · total ${a.totalMs.toFixed(1)}ms · max ${a.maxMs.toFixed(1)}ms`}
            >
              <strong style={{ flex: '0 0 30%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.component}
              </strong>
              <div style={{ flex: '1', position: 'relative', height: '14px', background: '#1f1f1f', borderRadius: '2px' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${widthPct}%`,
                    background: color,
                    opacity: a.worstSeverity === 'low' ? 0.4 : 0.7,
                    borderRadius: '2px',
                  }}
                />
              </div>
              <span style={{ flex: '0 0 auto', color, minWidth: '56px', textAlign: 'right' }}>
                {a.totalMs.toFixed(1)}ms
              </span>
              <span style={{ flex: '0 0 auto', color: '#888', minWidth: '32px', textAlign: 'right' }}>
                ×{a.count}
              </span>
            </div>
          )
        })}
        {hiddenCount > 0 && (
          <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
            {t.moreComponents(hiddenCount)}
          </div>
        )}
      </div>
    </div>
  )
}
