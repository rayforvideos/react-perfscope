export type StackFrame = {
  file: string
  line: number
  col: number
  fnName?: string
}

export type ForcedReflowSignal = {
  kind: 'forced-reflow'
  /** Time of the first layout read in the coalesced group. */
  at: number
  /** Sum of the measured layout-flush durations across the group, in ms. */
  duration: number
  /** Stack captured once, at the first read that opened the group. */
  stack: StackFrame[]
  /** How many layout reads were coalesced into this group. Absent means 1.
   * Reads in the same synchronous turn are merged so a layout-thrash loop
   * surfaces as one signal carrying a count rather than thousands. */
  count?: number
}

export type LayoutShiftSignal = {
  kind: 'layout-shift'
  at: number
  value: number
  sources: DOMRect[]
  /**
   * Parallel array to `sources`. Each entry is the rect of the source node
   * BEFORE the shift, in document coords. `null` when the source had no
   * previous rect (newly inserted element). Lets consumers draw a "moved
   * from → to" arrow during overlay rendering.
   */
  previousSources?: (DOMRect | null)[]
}

export type LongTaskScript = {
  /** What kind of entry point ran this script: 'event-listener',
   * 'user-callback', 'resolve-promise', 'reject-promise', 'classic-script',
   * 'module-script', etc. (from the LoAF spec). */
  invokerType: string
  /** Human-readable invoker, e.g. "BUTTON#go.onclick" or a callback name. */
  invoker: string
  sourceURL: string
  sourceFunctionName: string
  /** Character offset of the function in its source, or -1 when unknown. */
  charPosition: number
  /** Wall-clock ms this script occupied. */
  duration: number
}

/**
 * One hot user-source location inside a long task, derived from JS
 * Self-Profiling samples. Answers "which of MY functions burned the time",
 * which LoAF cannot do for React-delegated events (it only sees React's
 * single root dispatcher). `frame` is the raw served-file position; resolve
 * it through source maps for the original location.
 */
export type LongTaskAttribution = {
  frame: StackFrame
  /** Fraction (0..1) of this task's in-window samples whose leaf user frame
   * was this one. */
  selfRatio: number
  /** Number of in-window samples attributed to this frame. */
  sampleCount: number
}

export type LongTaskSignal = {
  kind: 'long-task'
  at: number
  duration: number
  stack: StackFrame[]
  /** Per-script attribution from the Long Animation Frame API. Absent when
   * LoAF is unsupported (falls back to the legacy `longtask` entry, which
   * gives duration only). */
  scripts?: LongTaskScript[]
  /** Main-thread blocking time reported by LoAF, when available. */
  blockingDuration?: number
  /** Hottest user-source frames inside this task, from JS Self-Profiling.
   * Sorted by sampleCount desc. Absent when self-profiling is unavailable
   * (no Profiler API or missing Document-Policy header). */
  attribution?: LongTaskAttribution[]
}

export type WebVitalSignal = {
  kind: 'web-vital'
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
  value: number
}

export type NetworkSignal = {
  kind: 'network'
  url: string
  startedAt: number
  duration: number
  size: number
  blocking: boolean
}

export type InteractionSignal = {
  kind: 'interaction'
  /** Event startTime — when the user input arrived. */
  at: number
  /** Event type that defined the interaction latency (click, pointerup, keydown…). */
  eventType: string
  /** Best-effort CSS-ish selector of the event target. */
  target?: string
  /** Total interaction latency: input → handlers → next paint (ms). */
  duration: number
  /** startTime → processingStart: main thread was busy before handlers ran. */
  inputDelay: number
  /** processingStart → processingEnd: the event handlers themselves. */
  processing: number
  /** processingEnd → next paint: re-render + paint after handlers. */
  presentation: number
  /** Hottest user-source frames during the processing window, from JS
   * Self-Profiling. Absent when self-profiling is unavailable or found none. */
  attribution?: LongTaskAttribution[]
}

export type RenderReason = 'mount' | 'state' | 'props' | 'parent'

export type RenderSignal = {
  kind: 'render'
  at: number
  component: string
  reason: RenderReason
  duration: number
  /** Prop keys that changed since the previous render (reason === 'props'). */
  changedProps?: string[]
  /** Groups every render from the same commit. Shared by a commit signal and
   * all of its members. */
  commitId: number
  /** Fiber depth from the committed root — used to indent the cascade. */
  depth: number
  /** Present only on the per-commit cascade signal: every component that
   * re-rendered in this commit, in walk order. Each member is itself a
   * RenderSignal (without its own `members`). On the commit signal,
   * `component`/`reason`/`depth`/`changedProps` describe the cascade root and
   * `duration` is the commit's total render time (sum of member durations).
   * Coalescing one signal per commit (instead of one per fiber) keeps a
   * layout-thrash-scale re-render from flooding the buffer and the UI. */
  members?: RenderSignal[]
  /** members.length, on the commit signal. */
  count?: number
}

export type Signal =
  | ForcedReflowSignal
  | LayoutShiftSignal
  | LongTaskSignal
  | WebVitalSignal
  | NetworkSignal
  | RenderSignal
  | InteractionSignal

export type SignalKind = Signal['kind']

/** One heap-usage reading. `at` shares the performance.now() clock used by
 * signal timestamps, so it lines up with the timeline x-axis. */
export type HeapSample = {
  at: number
  /** usedJSHeapSize — live JS objects, in bytes. */
  used: number
  /** totalJSHeapSize — allocated heap, in bytes. */
  total: number
}

export type HeapTrendClass = 'stable' | 'growing' | 'leak-suspected'

export type HeapTrend = {
  classification: HeapTrendClass
  /** Slope of the heap "floor" (post-GC troughs), in bytes per minute. A
   * steadily rising floor is the signal that memory is being retained. */
  slopeBytesPerMin: number
}

/** One windowed frame-rate reading. */
export type FpsSample = {
  at: number
  fps: number
}

export type FrameStats = {
  /** Windowed FPS series across the recording. */
  series: FpsSample[]
  /** Lowest windowed FPS — the worst sustained dip. */
  minFps: number
  /** Longest single inter-frame gap (worst hitch), in ms. */
  longestFrameMs: number
  /** Approximate frames dropped across the recording (vs a 60fps budget). */
  droppedFrames: number
}

export interface RecordingResult {
  signals: Signal[]
  startedAt: number
  duration: number
  /** Heap-usage time series, present only when performance.memory is
   * available (Chromium). Attached at finalize, not part of the signal buffer. */
  heapSamples?: HeapSample[]
  /** requestAnimationFrame timestamps captured during the recording, for
   * frame-rate / jank analysis. Attached at finalize. */
  frames?: number[]
}

/** Collectors are usually keyed by the SignalKind they emit. A few (heap,
 * self-profiling) drive a side-channel instead of emitting signals; `'heap'`
 * widens the kind for the heap sampler, which attaches a time series via
 * finalize rather than pushing signals. */
export type CollectorKind = SignalKind | 'heap' | 'frame'

export interface Collector {
  readonly kind: CollectorKind
  activate(emit: (signal: Signal) => void): void
  deactivate(): void
}

export interface Recorder {
  start(): void
  stop(): RecordingResult
  isRecording(): boolean
  onSignal(cb: (signal: Signal) => void): () => void
  use(collector: Collector): void
}
