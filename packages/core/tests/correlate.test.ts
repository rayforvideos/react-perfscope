import { describe, it, expect } from 'vitest'
import { correlate } from '../src/correlate'
import type { Signal } from '../src/types'

describe('correlate', () => {
  it('groups a render that runs inside a long task into that task episode', () => {
    const longTask: Signal = { kind: 'long-task', at: 100, duration: 50, stack: [] }
    const render: Signal = {
      kind: 'render',
      at: 120,
      component: 'A',
      reason: 'state',
      duration: 5,
      commitId: 1,
      depth: 0,
    }

    const episodes = correlate([longTask, render])

    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.anchor).toBe(longTask)
    expect(episodes[0]!.members.map((m) => m.signal)).toEqual([render])
  })

  it('excludes signals whose `at` falls outside the anchor window', () => {
    const longTask: Signal = { kind: 'long-task', at: 100, duration: 50, stack: [] }
    const before: Signal = { kind: 'layout-shift', at: 90, value: 0.1, sources: [] }
    const after: Signal = { kind: 'layout-shift', at: 200, value: 0.1, sources: [] }

    const episodes = correlate([before, longTask, after])

    expect(episodes[0]!.members).toEqual([])
  })

  it('anchors episodes on interactions too', () => {
    const interaction: Signal = {
      kind: 'interaction',
      at: 100,
      eventType: 'click',
      duration: 80,
      inputDelay: 10,
      processing: 40,
      presentation: 30,
    }
    const reflow: Signal = { kind: 'forced-reflow', at: 130, duration: 4, stack: [] }

    const episodes = correlate([interaction, reflow])

    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.anchor).toBe(interaction)
    expect(episodes[0]!.members.map((m) => m.signal)).toEqual([reflow])
  })

  it('marks a reflow whose stack matches an anchor hot frame as caused', () => {
    const frame = { file: 'App.tsx', line: 79, col: 5 }
    const longTask: Signal = {
      kind: 'long-task',
      at: 100,
      duration: 50,
      stack: [],
      attribution: [{ frame, selfRatio: 0.8, sampleCount: 8 }],
    }
    const reflow: Signal = { kind: 'forced-reflow', at: 120, duration: 4, stack: [frame] }

    const [episode] = correlate([longTask, reflow])

    expect(episode!.members[0]!.confidence).toBe('caused')
  })

  it('marks a time-overlapping signal with no stack match as co-occurred', () => {
    const longTask: Signal = {
      kind: 'long-task',
      at: 100,
      duration: 50,
      stack: [],
      attribution: [{ frame: { file: 'Other.tsx', line: 1, col: 0 }, selfRatio: 1, sampleCount: 1 }],
    }
    const shift: Signal = { kind: 'layout-shift', at: 120, value: 0.1, sources: [] }

    const [episode] = correlate([longTask, shift])

    expect(episode!.members[0]!.confidence).toBe('co-occurred')
  })

  it('tags interaction members with the INP phase their `at` falls in', () => {
    // input-delay [100,110) · processing [110,150) · presentation [150,180]
    const interaction: Signal = {
      kind: 'interaction',
      at: 100,
      eventType: 'click',
      duration: 80,
      inputDelay: 10,
      processing: 40,
      presentation: 30,
    }
    const inDelay: Signal = { kind: 'forced-reflow', at: 105, duration: 1, stack: [] }
    const inProcessing: Signal = {
      kind: 'render',
      at: 120,
      component: 'A',
      reason: 'state',
      duration: 2,
      commitId: 1,
      depth: 0,
    }
    const inPresentation: Signal = { kind: 'layout-shift', at: 160, value: 0.1, sources: [] }

    const [episode] = correlate([interaction, inDelay, inProcessing, inPresentation])

    expect(episode!.members.map((m) => m.phase)).toEqual([
      'input-delay',
      'processing',
      'presentation',
    ])
  })

  it('leaves phase undefined for long-task episode members', () => {
    const longTask: Signal = { kind: 'long-task', at: 100, duration: 50, stack: [] }
    const render: Signal = {
      kind: 'render',
      at: 120,
      component: 'A',
      reason: 'state',
      duration: 2,
      commitId: 1,
      depth: 0,
    }

    const [episode] = correlate([longTask, render])

    expect(episode!.members[0]!.phase).toBeUndefined()
  })

  it('attributes a reflow to the render commit whose window contains it', () => {
    // render `at` is sampled post-commit, so the render phase occupies the
    // `duration` ms before it: window [130, 150].
    const interaction: Signal = {
      kind: 'interaction',
      at: 100,
      eventType: 'click',
      duration: 100,
      inputDelay: 10,
      processing: 80,
      presentation: 10,
    }
    const render: Signal = {
      kind: 'render',
      at: 150,
      component: 'Counter',
      reason: 'state',
      duration: 20,
      commitId: 7,
      depth: 0,
    }
    const reflow: Signal = { kind: 'forced-reflow', at: 140, duration: 3, stack: [] }

    const [episode] = correlate([interaction, render, reflow])
    const reflowMember = episode!.members.find((m) => m.signal.kind === 'forced-reflow')!

    expect(reflowMember.confidence).toBe('caused')
    expect(reflowMember.causedBy).toEqual({ commitId: 7, component: 'Counter' })
  })

  it('attributes a long reflow to the commit that completes just after it (post-commit `at`)', () => {
    // Real recording shape: the reflow runs in a layout effect (~37ms) and the
    // render `at` is sampled when the commit completes — after the reflow — with
    // a `duration` covering only the tiny render phase, not the layout work.
    const interaction: Signal = {
      kind: 'interaction',
      at: 0,
      eventType: 'click',
      duration: 56,
      inputDelay: 0.4,
      processing: 43.7,
      presentation: 11.9,
    }
    const reflow: Signal = { kind: 'forced-reflow', at: 3.2, duration: 37.1, stack: [], count: 2000 }
    const render: Signal = {
      kind: 'render',
      at: 43.9,
      component: 'RenderReflowDemo',
      reason: 'state',
      duration: 0.9,
      commitId: 0,
      depth: 0,
    }

    const [episode] = correlate([interaction, reflow, render])
    const reflowMember = episode!.members.find((m) => m.signal.kind === 'forced-reflow')!

    expect(reflowMember.confidence).toBe('caused')
    expect(reflowMember.causedBy).toEqual({ commitId: 0, component: 'RenderReflowDemo' })
  })

  it('does not attribute a reflow that falls outside any commit window', () => {
    const interaction: Signal = {
      kind: 'interaction',
      at: 100,
      eventType: 'click',
      duration: 100,
      inputDelay: 10,
      processing: 80,
      presentation: 10,
    }
    const render: Signal = {
      kind: 'render',
      at: 150,
      component: 'Counter',
      reason: 'state',
      duration: 20,
      commitId: 7,
      depth: 0,
    }
    const reflow: Signal = { kind: 'forced-reflow', at: 120, duration: 3, stack: [] }

    const [episode] = correlate([interaction, render, reflow])
    const reflowMember = episode!.members.find((m) => m.signal.kind === 'forced-reflow')!

    expect(reflowMember.causedBy).toBeUndefined()
    expect(reflowMember.confidence).toBe('co-occurred')
  })
})
