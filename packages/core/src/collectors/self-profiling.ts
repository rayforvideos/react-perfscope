import type { Collector, LongTaskAttribution, RecordingResult, Signal, StackFrame } from '../types'

/**
 * JS Self-Profiling API trace shape (the subset we consume).
 * @see https://wicg.github.io/js-self-profiling/
 */
export interface ProfilerFrame {
  name?: string
  resourceId?: number
  line?: number
  column?: number
}
export interface ProfilerStack {
  frameId: number
  parentId?: number
}
export interface ProfilerSample {
  /** DOMHighResTimeStamp, same clock as performance.now() / entry.startTime. */
  timestamp: number
  stackId?: number
}
export interface ProfilerTrace {
  resources: string[]
  frames: ProfilerFrame[]
  stacks: ProfilerStack[]
  samples: ProfilerSample[]
}

interface ProfilerInstance {
  stop(): Promise<ProfilerTrace>
}
interface ProfilerCtor {
  new (opts: { sampleInterval: number; maxBufferSize: number }): ProfilerInstance
}

/** Default sampling cadence. The browser may coarsen this. */
const SAMPLE_INTERVAL_MS = 10
const MAX_BUFFER_SIZE = 100_000
/** Keep the noisiest few; deeper tails rarely help the developer. */
const MAX_FRAMES_PER_TASK = 5

/**
 * Whether a resource URL belongs to the developer's own source (vs. a
 * dependency or tooling shim). Dependency frames are noise when the question
 * is "which of MY functions is slow".
 */
export function isUserResource(url: string | undefined): boolean {
  if (!url) return false
  if (url.includes('/node_modules/')) return false
  // Vite/dev tooling virtual modules: /@vite/client, /@react-refresh, /@id/...
  try {
    const path = new URL(url).pathname
    if (path.startsWith('/@')) return false
  } catch {
    if (url.startsWith('/@')) return false
  }
  return true
}

function frameToStackFrame(trace: ProfilerTrace, frame: ProfilerFrame): StackFrame {
  const file = frame.resourceId != null ? (trace.resources[frame.resourceId] ?? '') : ''
  const sf: StackFrame = {
    file,
    line: frame.line ?? 0,
    col: frame.column ?? 0,
  }
  if (frame.name) sf.fnName = frame.name
  return sf
}

/**
 * Climb a sample's stack from the leaf toward the root, returning the first
 * (deepest) frame that lives in user source. That frame is where the
 * developer's own code was actually executing when the sample was taken.
 */
function leafUserFrame(trace: ProfilerTrace, stackId: number | undefined): ProfilerFrame | null {
  let id = stackId
  let guard = 0
  while (id != null && guard++ < 1000) {
    const stack = trace.stacks[id]
    if (!stack) break
    const frame = trace.frames[stack.frameId]
    if (frame && isUserResource(trace.resources[frame.resourceId ?? -1])) {
      return frame
    }
    id = stack.parentId
  }
  return null
}

/**
 * Aggregate the hottest user-source frames among samples whose timestamp
 * falls in [start, end]. `selfRatio` is relative to ALL in-window samples
 * (including vendor-only ones), so it reflects the share of the task's
 * blocking time spent in that user function.
 */
export function attributeWindow(
  trace: ProfilerTrace,
  start: number,
  end: number
): LongTaskAttribution[] {
  let total = 0
  const counts = new Map<string, { frame: StackFrame; count: number }>()
  for (const sample of trace.samples) {
    if (sample.timestamp < start || sample.timestamp > end) continue
    total++
    const frame = leafUserFrame(trace, sample.stackId)
    if (!frame) continue
    const sf = frameToStackFrame(trace, frame)
    const key = `${sf.file}:${sf.line}:${sf.col}:${sf.fnName ?? ''}`
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { frame: sf, count: 1 })
  }
  if (total === 0) return []
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FRAMES_PER_TASK)
    .map(({ frame, count }) => ({ frame, selfRatio: count / total, sampleCount: count }))
}

/**
 * Return a copy of `signals` with each long-task signal enriched with the
 * hottest user frames sampled during its window. Long tasks with no in-window
 * user samples are left without `attribution`. Non-long-task signals pass
 * through by reference.
 */
export function attributeLongTaskSignals(trace: ProfilerTrace, signals: Signal[]): Signal[] {
  return signals.map((signal) => {
    if (signal.kind !== 'long-task') return signal
    const attribution = attributeWindow(trace, signal.at, signal.at + signal.duration)
    if (attribution.length === 0) return signal
    return { ...signal, attribution }
  })
}

/**
 * Like {@link attributeLongTaskSignals} but for interactions: attributes the
 * *processing* window (handlers running, `[at+inputDelay, +processing]`) to the
 * developer's hot functions — answering "which of my code made this click
 * slow". Input delay and presentation aren't JS-on-the-stack, so they're
 * excluded from the window.
 */
export function attributeInteractionSignals(trace: ProfilerTrace, signals: Signal[]): Signal[] {
  return signals.map((signal) => {
    if (signal.kind !== 'interaction') return signal
    const start = signal.at + signal.inputDelay
    const attribution = attributeWindow(trace, start, start + signal.processing)
    if (attribution.length === 0) return signal
    return { ...signal, attribution }
  })
}

interface SelfProfilingCollector extends Collector {
  /** Stop the profiler (if running), await its trace, and return a result
   * with long-task signals enriched. Falls back to the input on any failure
   * or when the Profiler API / Document-Policy header is unavailable. */
  finalize(result: RecordingResult): Promise<RecordingResult>
}

/**
 * Collector that runs the JS Self-Profiling API across a recording and, on
 * finalize, attributes each long task to the developer's own hot functions —
 * something LoAF can't do for React-delegated events (it only sees React's
 * single root dispatcher).
 *
 * It reports `kind: 'long-task'` because it enriches that signal rather than
 * emitting its own. Requires Chromium + a `Document-Policy: js-profiling`
 * response header (the dev plugins inject it); degrades to a no-op otherwise.
 */
export function createSelfProfilingCollector(): SelfProfilingCollector {
  let profiler: ProfilerInstance | null = null
  let tracePromise: Promise<ProfilerTrace> | null = null

  return {
    kind: 'long-task',
    activate() {
      tracePromise = null
      const Ctor = (globalThis as { Profiler?: ProfilerCtor }).Profiler
      if (typeof Ctor !== 'function') return
      try {
        profiler = new Ctor({ sampleInterval: SAMPLE_INTERVAL_MS, maxBufferSize: MAX_BUFFER_SIZE })
      } catch (err) {
        // Thrown when the Document-Policy: js-profiling header is absent.
        console.warn(
          '[react-perfscope] self-profiling unavailable (needs Document-Policy: js-profiling header); long tasks keep LoAF-only attribution:',
          err
        )
        profiler = null
      }
    },
    deactivate() {
      if (!profiler) return
      try {
        tracePromise = profiler.stop()
      } catch (err) {
        console.warn('[react-perfscope] self-profiling stop failed:', err)
        tracePromise = null
      }
      profiler = null
    },
    async finalize(result: RecordingResult): Promise<RecordingResult> {
      if (!tracePromise) return result
      try {
        const trace = await tracePromise
        const signals = attributeInteractionSignals(trace, attributeLongTaskSignals(trace, result.signals))
        return { ...result, signals }
      } catch (err) {
        console.warn('[react-perfscope] self-profiling finalize failed:', err)
        return result
      } finally {
        tracePromise = null
      }
    },
  }
}
