import { h } from 'preact'
import type { Signal, SignalKind, WebVitalSignal } from '@react-perfscope/core'
import { SEVERITY_COLOR, RATING_COLOR, worstSeverity, webVitalRating } from './severity'
import { useI18n } from './i18n'

interface SummaryHeaderProps {
  signals: Signal[]
  grouped: Record<SignalKind, Signal[]>
  kindsPresent: SignalKind[]
  onKindClick?: (kind: SignalKind) => void
}

const WEB_VITAL_UNIT: Record<WebVitalSignal['name'], string> = {
  LCP: 'ms',
  INP: 'ms',
  CLS: '',
  FCP: 'ms',
  TTFB: 'ms',
}

function formatVitalValue(name: WebVitalSignal['name'], value: number): string {
  if (name === 'CLS') return value.toFixed(3)
  if (value >= 1000) return (value / 1000).toFixed(2) + 's'
  return value.toFixed(0)
}

function VitalChip({ s }: { s: WebVitalSignal }) {
  const { t } = useI18n()
  const rating = webVitalRating(s.name, s.value)
  const color = RATING_COLOR[rating]
  const unit = WEB_VITAL_UNIT[s.name]
  return (
    <span
      data-vital={s.name}
      data-rating={rating}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '999px',
        background: '#1a1a1a',
        border: `1px solid ${color}33`,
        fontSize: '11px',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
      }}
    >
      <span
        aria-label={t.ratingLabel(rating)}
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          flex: '0 0 6px',
        }}
      />
      <strong style={{ color: '#e6e6e6' }}>{s.name}</strong>
      <span style={{ color }}>
        {formatVitalValue(s.name, s.value)}
        {unit !== 's' ? unit : ''}
      </span>
    </span>
  )
}

export function SummaryHeader({ signals, grouped, kindsPresent, onKindClick }: SummaryHeaderProps) {
  const { t } = useI18n()
  // Latest web-vital per name — vitals can be re-reported and the freshest
  // value is what matters in the summary.
  const latestVitals = new Map<WebVitalSignal['name'], WebVitalSignal>()
  for (const s of signals) {
    if (s.kind === 'web-vital') latestVitals.set(s.name, s)
  }
  const vitals = Array.from(latestVitals.values())
  const nonVitalKinds = kindsPresent.filter((k) => k !== 'web-vital')

  return (
    <div
      style={{
        marginBottom: '8px',
        padding: '8px 10px',
        background: '#141414',
        border: '1px solid #1f1f1f',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {vitals.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {vitals.map((v) => (
            <VitalChip key={v.name} s={v} />
          ))}
        </div>
      )}
      {nonVitalKinds.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '11px',
            color: '#aaa',
            fontFamily: 'SF Mono, Menlo, Consolas, monospace',
          }}
        >
          {nonVitalKinds.map((k) => {
            const list = grouped[k]
            const sev = worstSeverity(list)
            const color = sev === 'low' ? '#aaa' : SEVERITY_COLOR[sev]
            return (
              <span
                key={k}
                data-summary-kind={k}
                onClick={() => onKindClick?.(k)}
                style={{
                  cursor: onKindClick ? 'pointer' : 'default',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={t.signalsTitle(list.length, t.kindLabel(k))}
              >
                {sev !== 'low' && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: color,
                      flex: '0 0 6px',
                    }}
                  />
                )}
                <span>{t.kindLabel(k)}</span>
                <strong style={{ color }}>{list.length}</strong>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
