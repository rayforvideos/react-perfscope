import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/preact'
import type { Signal } from '@react-perfscope/core'
import { I18nProvider } from '../src/i18n'
import { LongTaskEpisode } from '../src/long-task-episode'

const correlateCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('@react-perfscope/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-perfscope/core')>()
  return {
    ...actual,
    correlate: (...args: Parameters<typeof actual.correlate>) => {
      correlateCalls.count++
      return actual.correlate(...args)
    },
  }
})

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

  it('does not recompute correlate() when re-rendered with the same signals', () => {
    // correlate() is O(anchors × signals) over the whole recording; the panel
    // re-renders on every filter keystroke / toggle, so it must be memoized.
    const signals: Signal[] = [
      { kind: 'long-task', at: 100, duration: 120, stack: [] },
      { kind: 'render', at: 130, component: 'SlowList', reason: 'state', duration: 5, commitId: 1, depth: 0 },
    ]
    // Fresh vnodes each time (so the component really re-executes), but the
    // same `signals` array — the memo key.
    const make = () => (
      <I18nProvider>
        <LongTaskEpisode signals={signals} />
      </I18nProvider>
    )
    const { rerender } = render(make())
    correlateCalls.count = 0
    rerender(make())
    rerender(make())
    expect(correlateCalls.count).toBe(0)
  })
})
