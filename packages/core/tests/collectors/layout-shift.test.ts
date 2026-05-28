import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLayoutShiftCollector } from '../../src/collectors/layout-shift'
import type { LayoutShiftSignal, Signal } from '../../src/types'

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

function fireShift(value: number, currentRects: DOMRect[]) {
  const sources = currentRects.map((rect) => ({ currentRect: rect, previousRect: rect, node: null }))
  const entry = {
    entryType: 'layout-shift',
    startTime: 100,
    duration: 0,
    name: '',
    value,
    hadRecentInput: false,
    sources,
  } as unknown as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'layout-shift' || opts.entryTypes?.includes('layout-shift')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('layout-shift collector', () => {
  it('registers PerformanceObserver for layout-shift', () => {
    const collector = createLayoutShiftCollector()
    collector.activate(() => {})
    expect(observers).toHaveLength(1)
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('layout-shift')
  })

  it('emits LayoutShiftSignal with value and sources', () => {
    const collector = createLayoutShiftCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    const rect = new DOMRect(10, 20, 100, 50)
    fireShift(0.07, [rect])
    expect(got).toHaveLength(1)
    const s = got[0] as LayoutShiftSignal
    expect(s.kind).toBe('layout-shift')
    expect(s.value).toBeCloseTo(0.07)
    expect(s.at).toBe(100)
    expect(s.sources).toHaveLength(1)
    expect(s.sources[0]).toEqual(rect)
  })

  it('skips entries marked hadRecentInput: true', () => {
    const collector = createLayoutShiftCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    const entry = {
      entryType: 'layout-shift',
      startTime: 50,
      duration: 0,
      name: '',
      value: 0.1,
      hadRecentInput: true,
      sources: [],
    } as unknown as PerformanceEntry
    for (const { cb } of observers) {
      cb({ getEntries: () => [entry] })
    }
    expect(got).toHaveLength(0)
  })

  it('disconnects on deactivate', () => {
    const collector = createLayoutShiftCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createLayoutShiftCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
