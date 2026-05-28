import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRecorder } from '../src/recorder'
import { createLongTasksCollector } from '../src/collectors/long-tasks'
import type { Signal } from '../src/types'

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

function fireLongTask(duration: number) {
  for (const { cb } of observers) {
    cb({
      getEntries: () => [
        { entryType: 'longtask', startTime: performance.now(), duration, name: '' } as PerformanceEntry,
      ],
    })
  }
}

describe('Recorder + collector integration', () => {
  it('start activates registered collectors and routes signals to buffer', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.start()
    fireLongTask(60)
    fireLongTask(80)
    const result = r.stop()
    expect(result.signals).toHaveLength(2)
    expect(result.signals.every((s: Signal) => s.kind === 'long-task')).toBe(true)
  })

  it('stop deactivates collectors (no more signals)', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.start()
    fireLongTask(60)
    r.stop()
    fireLongTask(80) // should not be buffered
    r.start()
    const result = r.stop()
    expect(result.signals).toHaveLength(0)
  })

  it('multiple collectors can be registered', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.use(createLongTasksCollector()) // second one harmless for this test
    r.start()
    fireLongTask(60)
    const result = r.stop()
    expect(result.signals.length).toBeGreaterThanOrEqual(1)
  })
})
