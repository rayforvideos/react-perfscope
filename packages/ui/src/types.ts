import type { Recorder } from '@react-perfscope/core'

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
}

export type UnmountFn = () => void
