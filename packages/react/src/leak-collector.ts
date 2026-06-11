import type { Collector, LeakSample, LeakSuspect, RecordingResult } from '@react-perfscope/core'
import { analyzeLeakTrend } from '@react-perfscope/core'
import { onFiberUnmount } from './devtools-hook'
import { fiberComponentName } from './fiber-walker'
import type { MinimalFiber } from './types'

/** How often to sample per-component retained counts. Matches the heap sampler
 * — cheap (reading a small map) and fine-grained enough to resolve the floor. */
const SAMPLE_INTERVAL_MS = 250
/** Per-component cap on retained-count samples. */
const MAX_SAMPLES = 4000

export interface LeakCollector extends Collector {
  finalize(result: RecordingResult): Promise<RecordingResult>
}

function maybeGc(): void {
  // Only present when Chrome is launched with --js-flags=--expose-gc. When
  // available, a nudge makes the final retained count accurate instead of
  // upper-bounded by GC lag. A no-op otherwise — the trend over the recording
  // is the real signal.
  const gc = (globalThis as { gc?: () => void }).gc
  if (typeof gc === 'function') {
    try {
      gc()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Detects component-level memory leaks: components whose instances were
 * unmounted but stayed retained (not garbage-collected), with a retained count
 * that climbed across the recording.
 *
 * Mechanism (all in-page, no DevTools protocol): React calls
 * `onCommitFiberUnmount` for each unmounted fiber. For component fibers we
 * register the fiber in a FinalizationRegistry (keyed by component name) and
 * bump an `unmounted` counter; when the fiber is later collected the registry
 * callback bumps a `collected` counter. `retained = unmounted − collected` is
 * sampled over time and fed to {@link analyzeLeakTrend}. A component whose
 * retained floor keeps rising is flagged.
 *
 * Limitation: identifies WHICH component leaks and HOW MANY instances, not the
 * retainer chain (who holds them) — that needs a heap snapshot, unavailable to
 * in-page JS. No-ops when FinalizationRegistry is unavailable.
 */
export function createLeakCollector(): LeakCollector {
  const unmounted = new Map<string, number>()
  const collected = new Map<string, number>()
  const series = new Map<string, LeakSample[]>()
  let registry: FinalizationRegistry<string> | null = null
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let active = false

  function bump(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  function retainedFor(name: string): number {
    return (unmounted.get(name) ?? 0) - (collected.get(name) ?? 0)
  }

  function sample(): void {
    const at = performance.now()
    for (const name of unmounted.keys()) {
      let arr = series.get(name)
      if (!arr) {
        arr = []
        series.set(name, arr)
      }
      arr.push({ at, retained: retainedFor(name) })
      if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES)
    }
  }

  function onUnmount(fiber: MinimalFiber): void {
    if (!active) return
    // Only component fibers — host (DOM tag) fibers churn constantly and aren't
    // "component leaks". Anonymous components (no resolvable name) are skipped.
    if (typeof fiber.type === 'string') return
    const name = fiberComponentName(fiber)
    if (!name) return
    bump(unmounted, name)
    registry?.register(fiber as object, name)
  }

  return {
    kind: 'leak',
    activate() {
      // Re-activation without an intervening deactivate would overwrite (and
      // orphan) the running interval and the unmount subscription.
      if (active) return
      unmounted.clear()
      collected.clear()
      series.clear()
      if (typeof FinalizationRegistry === 'undefined') return // unsupported
      active = true
      registry = new FinalizationRegistry<string>((name) => {
        bump(collected, name)
      })
      unsubscribe = onFiberUnmount(onUnmount)
      timer = setInterval(sample, SAMPLE_INTERVAL_MS)
    },
    deactivate() {
      active = false
      if (timer != null) {
        clearInterval(timer)
        timer = null
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      sample() // final reading at stop
    },
    async finalize(result) {
      if (unmounted.size === 0) return result
      // Best-effort: collect now and let the registry's cleanup callbacks flush
      // so the final retained counts aren't inflated by GC lag.
      maybeGc()
      await new Promise((r) => setTimeout(r, 0))

      const suspects: LeakSuspect[] = []
      for (const name of unmounted.keys()) {
        const samples = series.get(name) ?? []
        const trend = analyzeLeakTrend(samples)
        const retained = retainedFor(name)
        if (trend?.leaking && retained > 0) {
          suspects.push({
            component: name,
            unmounted: unmounted.get(name) ?? 0,
            retained,
            retainedSlopePerMin: trend.slopePerMin,
          })
        }
      }
      if (suspects.length === 0) return result
      suspects.sort((a, b) => b.retained - a.retained)
      return { ...result, leakSuspects: suspects }
    },
  }
}
