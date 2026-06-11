import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import { correlate } from '@react-perfscope/core'
import type { Signal, Episode } from '@react-perfscope/core'
import { useI18n } from './i18n'
import { EpisodeMemberList } from './episode-shared'

/** Picks the long-task-anchored episode with the longest duration — the worst
 * single block of main-thread time in the recording. */
function worstLongTaskEpisode(signals: Signal[]): Episode | null {
  let worst: Episode | null = null
  for (const ep of correlate(signals)) {
    if (ep.anchor.kind !== 'long-task') continue
    if (!worst || ep.anchor.duration > worst.anchor.duration) worst = ep
  }
  return worst
}

export function LongTaskEpisode({ signals }: { signals: Signal[] }) {
  const { t } = useI18n()
  // correlate() walks the whole recording per anchor — memoize so the panel's
  // frequent re-renders (filter keystrokes, toggles) don't recompute it.
  const episode = useMemo(() => worstLongTaskEpisode(signals), [signals])
  if (!episode || episode.anchor.kind !== 'long-task') return null
  // With no members there's nothing to correlate — the raw signal list below
  // already shows the task on its own, so skip the (empty) episode card.
  if (episode.members.length === 0) return null
  const a = episode.anchor

  return (
    <div
      data-long-task-episode
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
        <strong>{t.kindLabel('long-task')}</strong> — <strong>{Math.round(a.duration)}ms</strong>
      </div>
      <div style={{ padding: '5px 8px' }}>
        <EpisodeMemberList members={episode.members} />
      </div>
    </div>
  )
}
