import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createInteractionCollector } from '../../src/collectors/interaction'
import type { InteractionSignal, RecordingResult } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void
let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []
let disconnectCount = 0

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {
    disconnectCount++
  }
}

beforeEach(() => {
  observers = []
  disconnectCount = 0
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})
afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

interface FakeEventTiming {
  entryType?: string
  name: string
  startTime: number
  processingStart: number
  processingEnd: number
  duration: number
  interactionId: number
  target?: unknown
}

function fire(entries: FakeEventTiming[], type = 'event') {
  const list = { getEntries: () => entries.map((e) => ({ entryType: type, ...e }) as unknown as PerformanceEntry) }
  for (const { cb, opts } of observers) {
    if (opts.type === type || opts.entryTypes?.includes(type)) cb(list)
  }
}

const baseResult: RecordingResult = { signals: [], startedAt: 0, duration: 0 }
const finalizeWith = (c: ReturnType<typeof createInteractionCollector>) =>
  c.finalize({ ...baseResult, signals: [] })

describe('interaction collector', () => {
  it('declares kind "interaction"', () => {
    expect(createInteractionCollector().kind).toBe('interaction')
  })

  it('observes Event Timing on activate', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    const types = observers.map((o) => o.opts.type ?? o.opts.entryTypes?.[0])
    expect(types).toContain('event')
  })

  it('spans the processing window across the group and picks the busiest event for the label', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    // One interaction: pointerdown ran briefly, click ran the real handler.
    // All events of an interaction share `duration` (220), so the breakdown
    // must span the group: earliest processingStart → latest processingEnd.
    fire([
      { name: 'pointerdown', startTime: 1000, processingStart: 1005, processingEnd: 1030, duration: 220, interactionId: 5 },
      { name: 'click', startTime: 1000, processingStart: 1010, processingEnd: 1210, duration: 220, interactionId: 5, target: { tagName: 'BUTTON', id: 'go', className: 'primary big' } },
    ])
    const out = c.finalize({ ...baseResult, signals: [] })
    const interactions = out.signals.filter((s) => s.kind === 'interaction') as InteractionSignal[]
    expect(interactions).toHaveLength(1)
    const s = interactions[0]!
    expect(s.eventType).toBe('click') // most processing (200ms vs pointerdown's 25ms)
    expect(s.at).toBe(1000)
    expect(s.duration).toBe(220)
    expect(s.inputDelay).toBe(5) // earliest processingStart (1005) - startTime (1000)
    expect(s.processing).toBe(205) // latest processingEnd (1210) - earliest processingStart (1005)
    expect(s.presentation).toBe(10) // (1000+220) - 1210
    expect(s.target).toContain('button#go')
  })

  it('ignores non-interaction events (interactionId 0) and sub-threshold interactions', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    fire([
      { name: 'pointermove', startTime: 0, processingStart: 1, processingEnd: 2, duration: 100, interactionId: 0 },
      { name: 'click', startTime: 500, processingStart: 501, processingEnd: 510, duration: 20, interactionId: 7 }, // < 40ms
    ])
    expect(finalizeWith(c).signals.filter((s) => s.kind === 'interaction')).toHaveLength(0)
  })

  it('appends interactions to the existing signals, sorted by time', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    fire([
      { name: 'click', startTime: 3000, processingStart: 3005, processingEnd: 3100, duration: 100, interactionId: 9 },
      { name: 'keydown', startTime: 1000, processingStart: 1005, processingEnd: 1080, duration: 80, interactionId: 3 },
    ])
    const out = c.finalize({ ...baseResult, signals: [{ kind: 'web-vital', name: 'INP', value: 220 }] })
    const inter = out.signals.filter((s) => s.kind === 'interaction') as InteractionSignal[]
    expect(out.signals.some((s) => s.kind === 'web-vital')).toBe(true)
    expect(inter.map((s) => s.at)).toEqual([1000, 3000])
  })

  it('disconnects on deactivate and collects nothing afterward', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    c.deactivate()
    expect(disconnectCount).toBeGreaterThanOrEqual(1)
    fire([{ name: 'click', startTime: 1, processingStart: 2, processingEnd: 100, duration: 99, interactionId: 1 }])
    expect(finalizeWith(c).signals.filter((s) => s.kind === 'interaction')).toHaveLength(0)
  })

  it('releases buffered entries after finalize (no DOM retention across recordings)', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    fire([{ name: 'click', startTime: 1000, processingStart: 1005, processingEnd: 1100, duration: 150, interactionId: 4, target: { tagName: 'BUTTON' } }])
    c.deactivate()
    expect(finalizeWith(c).signals.filter((s) => s.kind === 'interaction')).toHaveLength(1)
    // Entries hold `target` DOM nodes — a second finalize must see an empty
    // buffer, otherwise the collector pins interacted elements until the next
    // recording starts (or forever).
    expect(finalizeWith(c).signals.filter((s) => s.kind === 'interaction')).toHaveLength(0)
  })

  it('caps the entry buffer during very long recordings', () => {
    const c = createInteractionCollector()
    c.activate(() => {})
    const batch: FakeEventTiming[] = []
    for (let i = 1; i <= 5050; i++) {
      batch.push({ name: 'click', startTime: i * 10, processingStart: i * 10 + 1, processingEnd: i * 10 + 5, duration: 100, interactionId: i })
    }
    fire(batch)
    const out = finalizeWith(c)
    const count = out.signals.filter((s) => s.kind === 'interaction').length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(5000)
  })

  it('no-ops when PerformanceObserver is unavailable', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const c = createInteractionCollector()
    expect(() => c.activate(() => {})).not.toThrow()
    expect(() => c.deactivate()).not.toThrow()
    expect(finalizeWith(c).signals.filter((s) => s.kind === 'interaction')).toHaveLength(0)
  })
})
