import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/preact'
import type { Signal } from '@react-perfscope/core'
import { I18nProvider } from '../src/i18n'
import { LongTaskEpisode } from '../src/long-task-episode'

afterEach(cleanup)

describe('LongTaskEpisode', () => {
  it('shows cross-signal members that ran during the longest long task', () => {
    const signals: Signal[] = [
      { kind: 'long-task', at: 100, duration: 120, stack: [] },
      { kind: 'render', at: 130, component: 'SlowList', reason: 'state', duration: 5, commitId: 1, depth: 0 },
    ]
    const { container } = render(
      <I18nProvider>
        <LongTaskEpisode signals={signals} />
      </I18nProvider>,
    )
    expect(container.querySelector('[data-long-task-episode]')).toBeTruthy()
    expect(container.textContent).toContain('SlowList')
    expect(container.textContent).toMatch(/120ms/)
  })

  it('renders nothing when no signals ran during the long task', () => {
    const signals: Signal[] = [{ kind: 'long-task', at: 100, duration: 120, stack: [] }]
    const { container } = render(
      <I18nProvider>
        <LongTaskEpisode signals={signals} />
      </I18nProvider>,
    )
    expect(container.querySelector('[data-long-task-episode]')).toBeNull()
  })
})
