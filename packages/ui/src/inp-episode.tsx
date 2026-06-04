import { h } from 'preact'
import { correlate } from '@react-perfscope/core'
import type { Signal, Episode, InpPhase } from '@react-perfscope/core'
import { useI18n } from './i18n'
import { EpisodeMemberList } from './episode-shared'

type PhaseLabelKey = 'inputDelay' | 'processingTime' | 'presentation'

const PHASES: { phase: InpPhase; labelKey: PhaseLabelKey }[] = [
  { phase: 'input-delay', labelKey: 'inputDelay' },
  { phase: 'processing', labelKey: 'processingTime' },
  { phase: 'presentation', labelKey: 'presentation' },
]

/** Picks the interaction-anchored episode with the longest latency — the
 * interaction that defines INP for this recording. */
function worstInteractionEpisode(signals: Signal[]): Episode | null {
  let worst: Episode | null = null
  for (const ep of correlate(signals)) {
    if (ep.anchor.kind !== 'interaction') continue
    if (!worst || ep.anchor.duration > worst.anchor.duration) worst = ep
  }
  return worst
}

function phaseMs(episode: Episode, phase: InpPhase): number {
  const a = episode.anchor
  if (a.kind !== 'interaction') return 0
  return phase === 'input-delay' ? a.inputDelay : phase === 'processing' ? a.processing : a.presentation
}

export function InpEpisode({ signals }: { signals: Signal[] }) {
  const { t } = useI18n()
  const episode = worstInteractionEpisode(signals)
  if (!episode || episode.anchor.kind !== 'interaction') return null
  const a = episode.anchor
  const target = a.target ? ` on ${a.target}` : ''

  return (
    <div
      data-inp-episode
      style={{
        margin: '0 0 8px',
        border: '1px solid #1f1f1f',
        borderRadius: '6px',
        background: '#121212',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #1f1f1f', color: '#ddd' }}>
        <strong>{a.eventType}</strong>
        {target} — <strong>{Math.round(a.duration)}ms</strong>{' '}
        <span style={{ color: '#888' }}>INP</span>
      </div>
      {PHASES.map(({ phase, labelKey }) => {
        const members = episode.members.filter((m) => m.phase === phase)
        return (
          <div
            key={phase}
            data-inp-phase={phase}
            style={{ display: 'flex', gap: '8px', padding: '5px 8px', borderTop: '1px solid #1a1a1a' }}
          >
            <div style={{ flex: '0 0 92px', color: '#aaa' }}>
              {t[labelKey]}
              <div style={{ color: '#666', fontSize: '10px' }}>{Math.round(phaseMs(episode, phase))}ms</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <EpisodeMemberList members={members} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
