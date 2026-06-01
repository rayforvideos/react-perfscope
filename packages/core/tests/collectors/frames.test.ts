import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFrameCollector, analyzeFrames } from '../../src/collectors/frames'
import type { RecordingResult } from '../../src/types'

const BUDGET = 1000 / 60 // ~16.67ms per frame at 60fps

// A run of evenly-spaced frame timestamps at a given fps.
function steady(fps: number, seconds: number, startAt = 0): number[] {
  const step = 1000 / fps
  const out: number[] = []
  for (let t = startAt; t <= startAt + seconds * 1000 + 1e-6; t += step) out.push(t)
  return out
}

describe('analyzeFrames', () => {
  it('returns null when there are too few frames', () => {
    expect(analyzeFrames([0, 16, 33])).toBeNull()
  })

  it('reports ~60fps and no dropped frames for a smooth stream', () => {
    const r = analyzeFrames(steady(60, 3))!
    expect(r.minFps).toBeGreaterThanOrEqual(55)
    expect(r.droppedFrames).toBe(0)
    expect(r.longestFrameMs).toBeLessThan(BUDGET * 1.6)
    expect(r.series.length).toBeGreaterThan(1)
  })

  it('counts dropped frames and the worst hitch across a long gap', () => {
    // Smooth 60fps, then a single 100ms stall, then smooth again.
    const frames = [...steady(60, 1, 0)]
    const last = frames[frames.length - 1]!
    frames.push(last + 100) // 100ms hitch → ~5 dropped frames
    frames.push(...steady(60, 1, last + 100 + BUDGET))
    const r = analyzeFrames(frames)!
    expect(r.longestFrameMs).toBeGreaterThanOrEqual(95)
    expect(r.droppedFrames).toBeGreaterThanOrEqual(4)
  })

  it('reports a low minFps for a sustained slow (~20fps) stretch', () => {
    const r = analyzeFrames(steady(20, 3))!
    expect(r.minFps).toBeLessThanOrEqual(25)
    expect(r.droppedFrames).toBeGreaterThan(0)
  })
})

// --- collector (mock requestAnimationFrame) ---

let rafCb: ((t: number) => void) | null = null
let rafCancelled = false

beforeEach(() => {
  rafCb = null
  rafCancelled = false
  ;(globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (t: number) => void) => {
    rafCb = cb
    return 1
  }
  ;(globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = () => {
    rafCancelled = true
  }
})
afterEach(() => {
  delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
  delete (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
})

const baseResult: RecordingResult = { signals: [], startedAt: 0, duration: 0 }

function pump(times: number[]) {
  for (const t of times) {
    const cb = rafCb
    if (cb) cb(t)
  }
}

describe('frame collector', () => {
  it('declares kind "frame"', () => {
    expect(createFrameCollector().kind).toBe('frame')
  })

  it('records rAF timestamps and attaches them on finalize', () => {
    const c = createFrameCollector()
    c.activate(() => {})
    pump([0, 16, 33, 50, 66, 83, 100, 116])
    c.deactivate()
    const out = c.finalize(baseResult)
    expect(out.frames).toBeDefined()
    expect(out.frames!.length).toBeGreaterThanOrEqual(8)
    expect(out.frames![0]).toBe(0)
  })

  it('stops the loop on deactivate', () => {
    const c = createFrameCollector()
    c.activate(() => {})
    pump([0, 16])
    c.deactivate()
    expect(rafCancelled).toBe(true)
  })

  it('no-ops when requestAnimationFrame is unavailable', () => {
    delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
    const c = createFrameCollector()
    expect(() => c.activate(() => {})).not.toThrow()
    expect(() => c.deactivate()).not.toThrow()
    expect(c.finalize(baseResult)).toBe(baseResult)
  })
})
