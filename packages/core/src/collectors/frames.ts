import type { Collector, FpsSample, FrameStats, RecordingResult } from '../types'

/** 60fps frame budget (ms). Gaps are scored against this to count drops. */
const FRAME_BUDGET = 1000 / 60
/** Window for the FPS series; 500ms smooths per-frame noise while still showing
 * a scroll-jank dip. */
const BUCKET_MS = 500
/** A trailing window shorter than this is too small to estimate FPS reliably. */
const MIN_BUCKET_SPAN = 100
/** Below this we can't say anything useful. */
const MIN_FRAMES = 8
/** Cap retained frames so a long session can't grow the array unbounded
 * (~5.5 min at 60fps); past that, oldest drop. */
const MAX_FRAMES = 20_000

/**
 * Turn raw requestAnimationFrame timestamps into a frame-rate picture:
 * a windowed FPS series, the lowest sustained FPS, the worst single hitch,
 * and an approximate dropped-frame count. Long tasks (>50ms) show up here as
 * big gaps, but so does sustained scroll jank (30–50ms frames) that the
 * long-task collector's threshold misses.
 *
 * Returns null when there are too few frames to analyze.
 */
export function analyzeFrames(frames: number[]): FrameStats | null {
  if (frames.length < MIN_FRAMES) return null

  let longestFrameMs = 0
  let droppedFrames = 0
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i]! - frames[i - 1]!
    if (gap > longestFrameMs) longestFrameMs = gap
    const dropped = Math.round(gap / FRAME_BUDGET) - 1
    if (dropped > 0) droppedFrames += dropped
  }

  const t0 = frames[0]!
  const end = frames[frames.length - 1]!
  const series: FpsSample[] = []
  let minFps = Infinity
  let idx = 0
  for (let bStart = t0; bStart < end; bStart += BUCKET_MS) {
    const bEnd = Math.min(bStart + BUCKET_MS, end)
    const span = bEnd - bStart
    let count = 0
    while (idx < frames.length && frames[idx]! < bEnd) {
      count++
      idx++
    }
    if (span < MIN_BUCKET_SPAN) break // skip a tiny trailing window
    const fps = count / (span / 1000)
    series.push({ at: bStart + span / 2, fps })
    if (fps < minFps) minFps = fps
  }
  if (series.length === 0) return null
  return { series, minFps, longestFrameMs, droppedFrames }
}

export interface FrameCollector extends Collector {
  /** Attach the captured frame timestamps to the result. Returns the input
   * untouched when too few frames were seen (or rAF was unavailable). */
  finalize(result: RecordingResult): RecordingResult
}

/**
 * Records requestAnimationFrame timestamps for the duration of a recording so
 * the UI can chart frame rate and surface jank. Emits no signals — the
 * timestamps are a side track attached at finalize. No-ops when
 * requestAnimationFrame is unavailable (non-DOM environments).
 */
export function createFrameCollector(): FrameCollector {
  let active = false
  let rafId: number | null = null
  let frames: number[] = []

  function loop(t: number): void {
    if (!active) return
    frames.push(t)
    if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES)
    rafId = requestAnimationFrame(loop)
  }

  return {
    kind: 'frame',
    activate() {
      if (typeof requestAnimationFrame === 'undefined') return
      active = true
      frames = []
      rafId = requestAnimationFrame(loop)
    },
    deactivate() {
      active = false
      if (rafId != null && typeof cancelAnimationFrame !== 'undefined') {
        try {
          cancelAnimationFrame(rafId)
        } catch {
          // ignore
        }
      }
      rafId = null
    },
    finalize(result) {
      if (frames.length < MIN_FRAMES) return result
      return { ...result, frames: frames.slice() }
    },
  }
}
