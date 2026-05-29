import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHeapCollector, analyzeHeapTrend } from '../../src/collectors/heap'
import type { HeapSample, RecordingResult } from '../../src/types'

type MemoryShape = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

function setMemory(mem: MemoryShape | undefined) {
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    get: () => mem,
  })
}

function clearMemory() {
  // Remove the property so reads see `undefined` (unsupported browser).
  delete (performance as unknown as { memory?: unknown }).memory
}

const baseResult: RecordingResult = { signals: [], startedAt: 0, duration: 0 }

describe('heap collector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearMemory()
  })

  it('declares kind "heap"', () => {
    expect(createHeapCollector().kind).toBe('heap')
  })

  it('samples on an interval while active and attaches heapSamples on finalize', () => {
    let used = 1_000_000
    setMemory({ usedJSHeapSize: used, totalJSHeapSize: 2_000_000, jsHeapSizeLimit: 9_000_000 })
    const c = createHeapCollector()
    c.activate(() => {})
    // initial sample taken on activate
    used = 1_500_000
    setMemory({ usedJSHeapSize: used, totalJSHeapSize: 2_000_000, jsHeapSizeLimit: 9_000_000 })
    vi.advanceTimersByTime(1000)
    used = 2_000_000
    setMemory({ usedJSHeapSize: used, totalJSHeapSize: 2_500_000, jsHeapSizeLimit: 9_000_000 })
    vi.advanceTimersByTime(1000)
    c.deactivate()
    const out = c.finalize(baseResult)
    expect(out.heapSamples).toBeDefined()
    // initial + 2 interval ticks + final sample on deactivate
    expect(out.heapSamples!.length).toBeGreaterThanOrEqual(3)
    expect(out.heapSamples!.every((s) => typeof s.used === 'number')).toBe(true)
  })

  it('stops sampling after deactivate', () => {
    setMemory({ usedJSHeapSize: 1_000_000, totalJSHeapSize: 2_000_000, jsHeapSizeLimit: 9_000_000 })
    const c = createHeapCollector()
    c.activate(() => {})
    c.deactivate()
    const countAfterStop = c.finalize(baseResult).heapSamples!.length
    vi.advanceTimersByTime(5000)
    // No further samples should have been collected after deactivate.
    expect(c.finalize(baseResult).heapSamples!.length).toBe(countAfterStop)
  })

  it('no-ops when performance.memory is unavailable (no heapSamples)', () => {
    clearMemory()
    const c = createHeapCollector()
    c.activate(() => {})
    vi.advanceTimersByTime(3000)
    c.deactivate()
    const out = c.finalize(baseResult)
    expect(out.heapSamples).toBeUndefined()
    expect(out).toBe(baseResult)
  })
})

const MB = 1024 * 1024

// Synthesize a heap series with a known floor slope (MB/min) and a GC sawtooth
// riding on top: even samples sit at the floor (just after GC), odd samples
// rise by the sawtooth amplitude (just before GC). Sampled every second.
function syntheticSeries(opts: {
  floorStartMb: number
  floorSlopeMbPerMin: number
  sawAmpMb: number
  n: number
}): HeapSample[] {
  const out: HeapSample[] = []
  for (let i = 0; i < opts.n; i++) {
    const at = i * 1000
    const floor = opts.floorStartMb + opts.floorSlopeMbPerMin * (at / 60000)
    const usedMb = i % 2 === 0 ? floor : floor + opts.sawAmpMb
    out.push({ at, used: usedMb * MB, total: (usedMb + 1) * MB })
  }
  return out
}

describe('analyzeHeapTrend', () => {
  it('returns null for too-few samples', () => {
    expect(analyzeHeapTrend([{ at: 0, used: MB, total: MB }, { at: 1000, used: MB, total: MB }])).toBeNull()
  })

  it('classifies a flat floor (full GC reclaim) as stable', () => {
    const s = syntheticSeries({ floorStartMb: 20, floorSlopeMbPerMin: 0, sawAmpMb: 20, n: 60 })
    const t = analyzeHeapTrend(s)!
    expect(t.classification).toBe('stable')
    expect(Math.abs(t.slopeBytesPerMin)).toBeLessThan(1 * MB)
  })

  it('classifies a steadily rising floor as leak-suspected', () => {
    const s = syntheticSeries({ floorStartMb: 20, floorSlopeMbPerMin: 10, sawAmpMb: 15, n: 60 })
    const t = analyzeHeapTrend(s)!
    expect(t.classification).toBe('leak-suspected')
    expect(t.slopeBytesPerMin).toBeGreaterThan(5 * MB)
  })

  it('classifies a mild upward drift as growing (between stable and leak)', () => {
    const s = syntheticSeries({ floorStartMb: 20, floorSlopeMbPerMin: 3, sawAmpMb: 10, n: 80 })
    const t = analyzeHeapTrend(s)!
    expect(t.classification).toBe('growing')
  })

  it('does not flag a tiny floor wobble on a short recording (no false leak)', () => {
    // ~5s recording where the floor drifts < 1MB: the per-minute slope looks
    // steep by extrapolation, but the net growth is trivial — must stay stable.
    const s = syntheticSeries({ floorStartMb: 168, floorSlopeMbPerMin: 12, sawAmpMb: 0.5, n: 5 })
    const t = analyzeHeapTrend(s)!
    expect(t.classification).toBe('stable')
  })

  it('does not flag a one-time warm-up step that then plateaus (idle stays stable)', () => {
    // Floor climbs 20→28MB over the first ~10s (V8 warm-up), then sits flat for
    // the rest. Overall regression is positive, but the recent half is flat — a
    // sustained leak this is not.
    const out: HeapSample[] = []
    for (let i = 0; i < 60; i++) {
      const floor = i < 10 ? 20 + i * 0.8 : 28
      const usedMb = i % 2 === 0 ? floor : floor + 8 // GC sawtooth on top
      out.push({ at: i * 1000, used: usedMb * MB, total: (usedMb + 1) * MB })
    }
    expect(analyzeHeapTrend(out)!.classification).toBe('stable')
  })
})
