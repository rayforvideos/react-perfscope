import { describe, it, expect } from 'vitest'
import { createForcedReflowCollector } from '../../src/collectors/forced-reflow'
import type { ForcedReflowSignal, Signal } from '../../src/types'

// Reflows are coalesced per synchronous turn and emitted on the next microtask
// (or synchronously on deactivate). Yield one microtask turn so the scheduled
// flush runs before assertions.
const tick = () => Promise.resolve()

describe('forced-reflow collector', () => {
  it('emits a forced-reflow signal when offsetWidth is read while active', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      await tick()
      expect(got.length).toBe(1)
      const s = got[0] as ForcedReflowSignal
      expect(s.kind).toBe('forced-reflow')
      expect(typeof s.at).toBe('number')
      expect(typeof s.duration).toBe('number')
      expect(s.count).toBe(1)
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('emits when getBoundingClientRect is called while active', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      div.getBoundingClientRect()
      await tick()
      expect(got.length).toBe(1)
    } finally {
      collector.deactivate()
    }
  })

  it('does not emit before activate or after deactivate', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []

    // Before activate
    const div1 = document.createElement('div')
    document.body.appendChild(div1)
    void div1.offsetWidth
    expect(got).toHaveLength(0)

    // While active — dirty the DOM first so dirty tracking allows the emit.
    // deactivate() flushes the open group synchronously.
    collector.activate((s) => got.push(s))
    div1.setAttribute('data-marker', 'active') // mutation to mark dirty
    void div1.offsetWidth
    collector.deactivate()
    const afterDeactivate = got.length
    expect(afterDeactivate).toBe(1)

    // After deactivate — no further signals
    void div1.offsetWidth
    expect(got).toHaveLength(afterDeactivate)
  })

  it('restores original getter on deactivate', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const collector = createForcedReflowCollector()
    collector.activate(() => {})
    collector.deactivate()
    const after = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    expect(after?.get).toBe(before?.get)
  })

  it('captures stack frames', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function trigger() {
        const div = document.createElement('div')
        document.body.appendChild(div)
        void div.offsetWidth
      }
      trigger()
      await tick()
      const s = got[0] as ForcedReflowSignal
      // happy-dom may produce minimal stacks; we only require parseStack ran
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('gracefully no-ops activate when no DOM globals available (smoke)', () => {
    const collector = createForcedReflowCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})

describe('forced-reflow collector coalescing', () => {
  it('merges many reads in one synchronous turn into a single signal', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      // Layout-thrash loop: write then read, repeatedly, in one turn.
      for (let i = 0; i < 20; i++) {
        div.setAttribute('data-i', String(i)) // mutation → next read is dirty
        void div.offsetWidth
      }
      await tick()
      expect(got.length).toBe(1)
      const s = got[0] as ForcedReflowSignal
      expect(s.count).toBe(20)
      expect(s.duration).toBeGreaterThanOrEqual(0)
    } finally {
      collector.deactivate()
    }
  })

  it('opens a new group for reads in a later turn', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      await tick() // close first window
      div.setAttribute('data-x', '1') // new mutation in a fresh turn
      void div.offsetWidth
      await tick()
      expect(got.length).toBe(2)
      expect((got[0] as ForcedReflowSignal).count).toBe(1)
      expect((got[1] as ForcedReflowSignal).count).toBe(1)
    } finally {
      collector.deactivate()
    }
  })

  it('attributes the stack to the caller, not the collector itself', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      await tick()
      const s = got[0] as ForcedReflowSignal
      // happy-dom may yield a minimal stack; only assert when frames exist.
      if (s.stack.length > 0) {
        // The patched accessor frame inside the collector must be stripped, so
        // the top frame points at user code — never the collector source.
        expect(s.stack[0]!.file).not.toMatch(/src\/collectors\/forced-reflow\.ts/)
      }
    } finally {
      collector.deactivate()
    }
  })

  it('flushes an open group synchronously on deactivate', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    const div = document.createElement('div')
    document.body.appendChild(div)
    void div.offsetWidth
    // No microtask awaited — deactivate must emit the pending group.
    collector.deactivate()
    expect(got.length).toBe(1)
  })
})

describe('forced-reflow collector lazy stack', () => {
  it('emits signals whose `stack` is implemented as a lazy getter', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      await tick()
      expect(got.length).toBe(1)
      const signal = got[0]!
      const desc = Object.getOwnPropertyDescriptor(signal, 'stack')
      expect(desc).toBeDefined()
      expect(typeof desc!.get).toBe('function')
      expect((desc as { value?: unknown }).value).toBeUndefined()
      // Reading still works
      expect(Array.isArray((signal as ForcedReflowSignal).stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })
})

describe('forced-reflow collector dirty tracking', () => {
  it('does not count a read when no DOM mutation occurred since the last read', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      // First read after appendChild is "dirty" — counted.
      void div.offsetWidth
      // Read again with no DOM mutation in between — should NOT be counted.
      void div.offsetWidth
      await tick()
      expect(got.length).toBe(1)
      expect((got[0] as ForcedReflowSignal).count).toBe(1)
    } finally {
      collector.deactivate()
    }
  })

  it('counts a read when a style write precedes it', async () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth // first dirty read
      div.setAttribute('style', 'width: 50px') // mutation via setAttribute
      void div.offsetWidth // dirty again → counted
      await tick()
      expect(got.length).toBe(1)
      expect((got[0] as ForcedReflowSignal).count).toBe(2)
    } finally {
      collector.deactivate()
    }
  })

  it('handles MutationObserver absence gracefully', () => {
    const original = (globalThis as { MutationObserver?: unknown }).MutationObserver
    delete (globalThis as { MutationObserver?: unknown }).MutationObserver
    try {
      const collector = createForcedReflowCollector()
      const got: Signal[] = []
      // Falls back to over-report mode (Phase 1 behavior).
      expect(() => {
        collector.activate((s) => got.push(s))
        const div = document.createElement('div')
        document.body.appendChild(div)
        void div.offsetWidth
        collector.deactivate()
      }).not.toThrow()
    } finally {
      ;(globalThis as { MutationObserver?: unknown }).MutationObserver = original
    }
  })
})
