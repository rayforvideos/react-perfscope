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

export type LongTaskSignal = {
  kind: 'long-task'
  at: number
  duration: number
  stack: StackFrame[]
}

export type PaintSignal = {
  kind: 'paint'
  at: number
  rect: DOMRect
  cause: 'style' | 'layout' | 'unknown'
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

export type RenderSignal = {
  kind: 'render'
  at: number
  component: string
  reason: string
  duration: number
}

export type Signal =
  | ForcedReflowSignal
  | LayoutShiftSignal
  | LongTaskSignal
  | PaintSignal
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
