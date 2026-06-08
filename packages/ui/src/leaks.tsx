import type { LeakSuspect } from '@react-perfscope/core'
import { useI18n } from './i18n'

/**
 * Compact list of suspected component leaks (components whose unmounted
 * instances stayed retained with a climbing count). Rendered in the timeline
 * tab alongside the heap strip; shows nothing when there are no suspects.
 */
export function LeakList({ suspects }: { suspects: LeakSuspect[] | undefined }) {
  const { t } = useI18n()
  if (!suspects || suspects.length === 0) return null
  return (
    <div data-leaks="" style={{ padding: '8px 10px', borderBottom: '1px solid #1c1c1c' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}
      >
        <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>{t.leaksTitle}</span>
        <span style={{ color: '#666', fontSize: '10px' }}>×{suspects.length}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {suspects.map((s) => (
          <li
            key={s.component}
            style={{ color: '#e6e6e6', fontSize: '11px', padding: '2px 0', fontVariantNumeric: 'tabular-nums' }}
          >
            {t.leakSuspect(s.component, s.retained, s.unmounted)}
          </li>
        ))}
      </ul>
      <p style={{ color: '#666', fontSize: '10px', margin: '6px 0 0', lineHeight: 1.4 }}>{t.leakHint}</p>
    </div>
  )
}
