import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPaintCollector } from '../../src/collectors/paint'
import type { PaintSignal, Signal } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void
let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {}
}

beforeEach(() => {
  observers = []
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})

afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

function firePaint(name: string, startTime: number) {
  const entry = { entryType: 'paint', name, startTime, duration: 0 } as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'paint' || opts.entryTypes?.includes('paint')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('paint collector', () => {
  it('registers PerformanceObserver for paint', () => {
    const collector = createPaintCollector()
    collector.activate(() => {})
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('paint')
  })

  it('emits PaintSignal with at timestamp and zero rect placeholder', () => {
    const collector = createPaintCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    firePaint('first-paint', 150)
    expect(got).toHaveLength(1)
    const s = got[0] as PaintSignal
    expect(s.kind).toBe('paint')
    expect(s.at).toBe(150)
    expect(s.cause).toBe('unknown')
    expect(s.rect.width).toBe(0)
    expect(s.rect.height).toBe(0)
  })

  it('disconnects on deactivate without throwing', () => {
    const collector = createPaintCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createPaintCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
