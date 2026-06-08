import { describe, it, expect } from 'vitest'
import { analyzeLeakTrend } from '../src/leak-trend'
import type { LeakSample } from '../src/leak-trend'

// Synthesize a retained-instance series with a known floor slope (instances per
// minute) and a GC sawtooth on top: even samples sit at the floor (just after a
// GC sweep), odd samples carry a few not-yet-collected instances. Sampled every
// second.
function syntheticSeries(opts: {
  floorStart: number
  floorSlopePerMin: number
  sawAmp: number
  n: number
}): LeakSample[] {
  const out: LeakSample[] = []
  for (let i = 0; i < opts.n; i++) {
    const at = i * 1000
    const floor = opts.floorStart + opts.floorSlopePerMin * (at / 60000)
    const retained = i % 2 === 0 ? floor : floor + opts.sawAmp
    out.push({ at, retained: Math.round(retained) })
  }
  return out
}

describe('analyzeLeakTrend', () => {
  it('returns null for too-few samples', () => {
    expect(
      analyzeLeakTrend([
        { at: 0, retained: 1 },
        { at: 1000, retained: 2 },
      ]),
    ).toBeNull()
  })

  it('does not flag a flat floor (every unmount eventually collected)', () => {
    // Instances pile up between sweeps but the post-GC floor stays at 0 — the
    // StrictMode mount→unmount→remount pattern looks like this.
    const s = syntheticSeries({ floorStart: 0, floorSlopePerMin: 0, sawAmp: 6, n: 60 })
    const t = analyzeLeakTrend(s)!
    expect(t.leaking).toBe(false)
  })

  it('flags a steadily climbing retained floor as leaking', () => {
    const s = syntheticSeries({ floorStart: 0, floorSlopePerMin: 12, sawAmp: 4, n: 60 })
    const t = analyzeLeakTrend(s)!
    expect(t.leaking).toBe(true)
    expect(t.slopePerMin).toBeGreaterThan(0)
  })

  it('does not flag a one-time step that then plateaus', () => {
    // Retained climbs 0→8 over the first ~10s (a screen mounts long-lived
    // instances once), then sits flat. Overall regression is positive, but the
    // recent half is flat — not a sustained leak.
    const out: LeakSample[] = []
    for (let i = 0; i < 60; i++) {
      const floor = i < 10 ? i * 0.8 : 8
      const retained = i % 2 === 0 ? floor : floor + 4
      out.push({ at: i * 1000, retained: Math.round(retained) })
    }
    const t = analyzeLeakTrend(out)!
    expect(t.leaking).toBe(false)
  })

  it('does not flag a tiny wobble on a short recording (no false leak)', () => {
    // ~5s window where the floor barely moves: the per-minute slope extrapolates
    // steep, but net growth is under the instance threshold.
    const s = syntheticSeries({ floorStart: 2, floorSlopePerMin: 12, sawAmp: 1, n: 5 })
    const t = analyzeLeakTrend(s)!
    expect(t.leaking).toBe(false)
  })
})
