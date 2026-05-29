import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLongTasksCollector } from '../../src/collectors/long-tasks'
import type { LongTaskSignal, Signal } from '../../src/types'

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

function fireEntry(entry: Partial<PerformanceEntry>) {
  const list = {
    getEntries: () => [{ entryType: 'longtask', startTime: 0, duration: 0, name: '', ...entry } as PerformanceEntry],
  }
  for (const { cb, opts } of observers) {
    if (opts.type === 'longtask' || opts.entryTypes?.includes('longtask')) {
      cb(list)
    }
  }
}

describe('long-tasks collector', () => {
  it('registers a PerformanceObserver on activate', () => {
    const collector = createLongTasksCollector()
    collector.activate(() => {})
    expect(observers).toHaveLength(1)
    const opts = observers[0]!.opts
    const observed = (opts.type ?? opts.entryTypes?.[0]) as string
    expect(observed).toBe('longtask')
  })

  it('emits long-task signals normalized from entries', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireEntry({ startTime: 100, duration: 75 })
    expect(got).toHaveLength(1)
    const s = got[0] as LongTaskSignal
    expect(s.kind).toBe('long-task')
    expect(s.at).toBe(100)
    expect(s.duration).toBe(75)
  })

  it('disconnect on deactivate', () => {
    const collector = createLongTasksCollector()
    collector.activate(() => {})
    collector.deactivate()
    expect(disconnectCount).toBe(1)
  })

  it('does not emit after deactivate', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    collector.deactivate()
    fireEntry({ startTime: 100, duration: 75 })
    expect(got).toHaveLength(0)
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createLongTasksCollector()
    expect(() => collector.activate(() => {})).not.toThrow()
    expect(() => collector.deactivate()).not.toThrow()
  })
})

describe('long-tasks collector with LoAF support', () => {
  beforeEach(() => {
    ;(FakeObserver as unknown as { supportedEntryTypes: string[] }).supportedEntryTypes = [
      'longtask',
      'long-animation-frame',
    ]
  })

  afterEach(() => {
    delete (FakeObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes
  })

  function fireLoAF(entry: Record<string, unknown>) {
    const list = {
      getEntries: () => [
        { entryType: 'long-animation-frame', startTime: 0, duration: 0, name: '', ...entry } as unknown as PerformanceEntry,
      ],
    }
    for (const { cb, opts } of observers) {
      if (opts.type === 'long-animation-frame' || opts.entryTypes?.includes('long-animation-frame')) {
        cb(list)
      }
    }
  }

  it('observes long-animation-frame when supported', () => {
    const collector = createLongTasksCollector()
    collector.activate(() => {})
    const opts = observers[0]!.opts
    const observed = (opts.type ?? opts.entryTypes?.[0]) as string
    expect(observed).toBe('long-animation-frame')
  })

  it('maps scripts[] into the signal', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireLoAF({
      startTime: 200,
      duration: 130,
      blockingDuration: 80,
      scripts: [
        {
          duration: 120,
          invoker: 'BUTTON#go.onclick',
          invokerType: 'event-listener',
          sourceURL: 'http://app/src/App.tsx',
          sourceFunctionName: 'handleClick',
          sourceCharPosition: 1234,
        },
      ],
    })
    const s = got[0] as LongTaskSignal
    expect(s.duration).toBe(130)
    expect(s.blockingDuration).toBe(80)
    expect(s.scripts).toHaveLength(1)
    expect(s.scripts![0]).toMatchObject({
      invokerType: 'event-listener',
      invoker: 'BUTTON#go.onclick',
      sourceURL: 'http://app/src/App.tsx',
      sourceFunctionName: 'handleClick',
      charPosition: 1234,
      duration: 120,
    })
  })

  it('emits an empty scripts array when LoAF reports none', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireLoAF({ startTime: 10, duration: 60 })
    const s = got[0] as LongTaskSignal
    expect(s.scripts).toEqual([])
  })
})
