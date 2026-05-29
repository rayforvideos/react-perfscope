import type {
  Collector,
  HeapSample,
  HeapTrend,
  HeapTrendClass,
  RecordingResult,
} from '../types'

/** How often to read heap usage while recording. Reading performance.memory
 * is cheap, so we sample at 4Hz: a 1s cadence is too coarse — short spikes fall
 * between samples and the line, drawn straight between sparse points, smooths
 * them into a ramp. 250ms localizes spikes without meaningful overhead. */
const SAMPLE_INTERVAL_MS = 250
/** Cap on retained samples so a multi-hour session can't grow the array
 * unbounded. At 250ms this is ~83 min; past that, oldest samples drop. */
const MAX_SAMPLES = 20_000

/** Below this, a trend can't be estimated reliably. */
const MIN_SAMPLES = 4
/** How many contiguous segments to split the series into when estimating the
 * floor. Each segment contributes its minimum (the post-GC trough). */
const FLOOR_SEGMENTS = 8

const MB = 1024 * 1024
/** Floor-growth thresholds, in bytes per minute. */
const GROWING_SLOPE = 1 * MB
const LEAK_SLOPE = 5 * MB
/** A rate alone isn't enough: over a short recording, a sub-megabyte wobble in
 * the floor extrapolates to a huge MB/min and would false-positive. Require the
 * floor to have actually risen by at least this much across the window before
 * calling anything growing/leaking. */
const MIN_NET_GROWTH = 2 * MB

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

function readMemory(): MemoryInfo | null {
  const perf = (globalThis as { performance?: { memory?: MemoryInfo } }).performance
  const mem = perf?.memory
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return null
  return mem
}

/**
 * Least-squares slope of points (x, y). Returns 0 when x has no spread
 * (vertical / single distinct x) to avoid a divide-by-zero blow-up.
 */
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
 * Estimate whether memory is being retained across the recording.
 *
 * GC makes raw heap usage a sawtooth, so the peak is noisy. The reliable
 * signal is the *floor* — the post-GC troughs. We split the series into
 * contiguous segments, take the minimum of each (its trough), and regress
 * those minima against time.
 *
 * A rising overall slope is necessary but NOT sufficient: a one-time step
 * (heap warms up early, then plateaus) also regresses to a positive slope, and
 * flagging that as a leak is a false positive — the classic "idle recording
 * reads abnormal" bug. A real leak keeps climbing, so we additionally require
 * the *recent* half of the floor to still be rising. We also gate on a minimum
 * net growth, since over a short window a sub-MB wobble extrapolates to a steep
 * per-minute slope.
 *
 * Returns null when there are too few samples to say anything.
 */
export function analyzeHeapTrend(samples: HeapSample[]): HeapTrend | null {
  if (samples.length < MIN_SAMPLES) return null
  const t0 = samples[0]!.at
  const segSize = Math.max(1, Math.ceil(samples.length / FLOOR_SEGMENTS))
  const floorPoints: { x: number; y: number }[] = []
  for (let i = 0; i < samples.length; i += segSize) {
    const seg = samples.slice(i, i + segSize)
    let min = Infinity
    for (const s of seg) min = Math.min(min, s.used)
    const mid = seg[Math.floor(seg.length / 2)]!
    floorPoints.push({ x: (mid.at - t0) / 60000, y: min })
  }
  const slopeBytesPerMin = slope(floorPoints)
  const spanMin = (samples[samples.length - 1]!.at - t0) / 60000
  const projectedGrowth = slopeBytesPerMin * spanMin
  // Recent trend: is the floor still climbing in the latter half? Distinguishes
  // a sustained leak from a one-time step that has since plateaued.
  const recent = floorPoints.slice(Math.floor(floorPoints.length / 2))
  const recentSlope = recent.length >= 2 ? slope(recent) : slopeBytesPerMin

  let classification: HeapTrendClass = 'stable'
  const sustained = projectedGrowth >= MIN_NET_GROWTH && recentSlope >= GROWING_SLOPE
  if (sustained) {
    classification =
      slopeBytesPerMin >= LEAK_SLOPE && recentSlope >= LEAK_SLOPE ? 'leak-suspected' : 'growing'
  }
  return { classification, slopeBytesPerMin }
}

export interface HeapCollector extends Collector {
  /** Attach the sampled heap series to the recording result. Returns the
   * input untouched when nothing was sampled (unsupported browser). */
  finalize(result: RecordingResult): RecordingResult
}

/**
 * Samples `performance.memory` on an interval for the duration of a recording
 * and attaches the series via `finalize`. It is a Collector so the recorder
 * drives its start/stop, but it emits no signals — the series is a separate
 * track (see RecordingResult.heapSamples), so a busy session's signal buffer
 * can't evict it. No-ops entirely when performance.memory is unavailable
 * (non-Chromium), leaving `heapSamples` absent so the UI can show a fallback.
 */
export function createHeapCollector(): HeapCollector {
  let samples: HeapSample[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  function sample(): void {
    const mem = readMemory()
    if (!mem) return
    samples.push({ at: performance.now(), used: mem.usedJSHeapSize, total: mem.totalJSHeapSize })
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
  }

  return {
    kind: 'heap',
    activate() {
      samples = []
      if (!readMemory()) return // unsupported → never start the timer
      sample()
      timer = setInterval(sample, SAMPLE_INTERVAL_MS)
    },
    deactivate() {
      if (timer == null) return
      clearInterval(timer)
      timer = null
      sample() // one final reading at stop
    },
    finalize(result) {
      if (samples.length === 0) return result
      return { ...result, heapSamples: samples.slice() }
    },
  }
}
