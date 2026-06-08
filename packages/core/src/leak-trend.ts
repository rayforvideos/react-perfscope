/** One reading of how many unmounted instances of a component are still
 * retained (alive, not yet garbage-collected) at a point in time. */
export type LeakSample = { at: number; retained: number }

/** Minimum samples before a trend can be estimated. */
const MIN_SAMPLES = 4
/** Segments to split the series into when estimating the retained floor. */
const FLOOR_SEGMENTS = 8
/** Require the retained floor to climb by at least this many instances across
 * the window before flagging — a transient one or two awaiting GC is not a
 * leak. */
const MIN_NET_GROWTH = 3

function slope(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  let sx = 0
  let sy = 0
  let sxy = 0
  let sxx = 0
  for (const { x, y } of points) {
    sx += x
    sy += y
    sxy += x * y
    sxx += x * x
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return 0
  return (n * sxy - sx * sy) / denom
}

/**
 * Decide whether a component's retained-instance series indicates a leak.
 *
 * Mirrors {@link analyzeHeapTrend}: GC makes the raw retained count a sawtooth
 * (instances pile up, then a sweep collects a batch), so the reliable signal is
 * the *floor* — the post-GC troughs. We segment the series, take each segment's
 * minimum, and regress those minima against time.
 *
 * A rising slope alone is not enough: a one-time step (a screen mounts N
 * long-lived instances once, then plateaus) regresses positive but is not a
 * leak. So we additionally require the recent half of the floor to still be
 * rising, and gate on a minimum net growth in instances. This is what makes the
 * detector robust to React StrictMode's intentional mount→unmount→remount
 * churn, whose discarded fibers get collected and keep the floor flat.
 *
 * Returns null when there are too few samples to say anything.
 */
export function analyzeLeakTrend(
  samples: LeakSample[]
): { leaking: boolean; slopePerMin: number } | null {
  if (samples.length < MIN_SAMPLES) return null
  const t0 = samples[0]!.at
  const segSize = Math.max(1, Math.ceil(samples.length / FLOOR_SEGMENTS))
  const floorPoints: { x: number; y: number }[] = []
  for (let i = 0; i < samples.length; i += segSize) {
    const seg = samples.slice(i, i + segSize)
    let min = Infinity
    for (const s of seg) min = Math.min(min, s.retained)
    const mid = seg[Math.floor(seg.length / 2)]!
    floorPoints.push({ x: (mid.at - t0) / 60000, y: min })
  }
  const slopePerMin = slope(floorPoints)
  const spanMin = (samples[samples.length - 1]!.at - t0) / 60000
  const projectedGrowth = slopePerMin * spanMin
  const recent = floorPoints.slice(Math.floor(floorPoints.length / 2))
  const recentSlope = recent.length >= 2 ? slope(recent) : slopePerMin
  const leaking = projectedGrowth >= MIN_NET_GROWTH && recentSlope > 0
  return { leaking, slopePerMin }
}
