import type { Recorder, RecordingResult, StackFrame } from '@react-perfscope/core'

export type WidgetPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'

export interface MountOptions {
  /** The recorder to control. The UI calls .start()/.stop() on it. */
  recorder: Recorder
  /** Corner placement of the floating widget. Defaults to 'bottom-right'. */
  position?: WidgetPosition
  /**
   * The host element under which the Shadow DOM root is created. Defaults
   * to document.body. Useful for testing or custom layouts.
   */
  host?: HTMLElement
  /**
   * Optional async resolver that maps a captured StackFrame to its original
   * source position. The Panel uses this when expanding a row with stack data.
   * Defaults to a no-op if not provided.
   */
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
  /**
   * Optional async post-processor run after `recorder.stop()`. The Panel
   * renders the raw result immediately, then re-renders with the resolved
   * value (e.g. self-profiling long-task attribution, which only becomes
   * available once the Profiler trace settles).
   */
  finalize?: (result: RecordingResult) => Promise<RecordingResult>
}

export type UnmountFn = () => void
