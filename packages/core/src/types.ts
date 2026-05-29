export type StackFrame = {
  file: string
  line: number
  col: number
  fnName?: string
}

export type ForcedReflowSignal = {
  kind: 'forced-reflow'
  at: number
  duration: number
  stack: StackFrame[]
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

export type RenderReason = 'mount' | 'state' | 'props' | 'parent'

export type RenderSignal = {
  kind: 'render'
  at: number
  component: string
  reason: RenderReason
  duration: number
  /** Prop keys that changed since the previous render (reason === 'props'). */
  changedProps?: string[]
  /** Groups every render emitted from the same commit so the UI can show
   * one cascade (root + the components it re-rendered) as a unit. */
  commitId: number
  /** Fiber depth from the committed root — used to indent the cascade. */
  depth: number
}

export type Signal =
  | ForcedReflowSignal
  | LayoutShiftSignal
  | LongTaskSignal
  | WebVitalSignal
  | NetworkSignal
  | RenderSignal

export type SignalKind = Signal['kind']

export interface RecordingResult {
  signals: Signal[]
  startedAt: number
  duration: number
}

export interface Collector {
  readonly kind: SignalKind
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
