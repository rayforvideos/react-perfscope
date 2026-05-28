import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createNetworkCollector } from '../../src/collectors/network'
import type { NetworkSignal, Signal } from '../../src/types'

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

function fireResource(partial: Partial<PerformanceResourceTiming> & { name: string }) {
  const entry = {
    entryType: 'resource',
    startTime: 100,
    duration: 200,
    transferSize: 1024,
    renderBlockingStatus: 'non-blocking',
    ...partial,
  } as unknown as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'resource' || opts.entryTypes?.includes('resource')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('network collector', () => {
  it('registers PerformanceObserver for resource', () => {
    const collector = createNetworkCollector()
    collector.activate(() => {})
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('resource')
  })

  it('emits NetworkSignal with url, startedAt, duration, size', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({ name: 'http://x/a.js', startTime: 50, duration: 120, transferSize: 8192 } as Partial<PerformanceResourceTiming> & { name: string })
    expect(got).toHaveLength(1)
    const s = got[0] as NetworkSignal
    expect(s.kind).toBe('network')
    expect(s.url).toBe('http://x/a.js')
    expect(s.startedAt).toBe(50)
    expect(s.duration).toBe(120)
    expect(s.size).toBe(8192)
    expect(s.blocking).toBe(false)
  })

  it('marks blocking: true when renderBlockingStatus is "blocking"', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({
      name: 'http://x/blocking.css',
      renderBlockingStatus: 'blocking',
    } as Partial<PerformanceResourceTiming> & { name: string })
    const s = got[0] as NetworkSignal
    expect(s.blocking).toBe(true)
  })

  it('falls back to 0 size when transferSize is missing', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({ name: 'http://x/cached.js', transferSize: 0 } as Partial<PerformanceResourceTiming> & { name: string })
    expect((got[0] as NetworkSignal).size).toBe(0)
  })

  it('disconnects on deactivate without throwing', () => {
    const collector = createNetworkCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createNetworkCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
