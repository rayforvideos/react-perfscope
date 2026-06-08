import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createSelfProfilingCollector,
  createHeapCollector,
  createInteractionCollector,
  createFrameCollector,
} from '@react-perfscope/core'
import type { Recorder, RecordingResult } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

export interface ConfiguredRecorder {
  recorder: Recorder
  /** Runs the post-recording finalize chain (interaction → self-profiling →
   * heap → frame) in the order each collector depends on the previous one. */
  finalize: (result: RecordingResult) => Promise<RecordingResult>
}

/**
 * Assembles the recorder + full collector set that react-perfscope ships,
 * minus the UI. The single source of truth for what gets recorded: both the
 * `/auto` bootstrap and the E2E verification harness call this, so the harness
 * can never validate a collector set that differs from what users get.
 *
 * The caller is responsible for installing the React DevTools hook BEFORE
 * react-dom evaluates (it is timing-sensitive) and for mounting any UI.
 */
export function createConfiguredRecorder(): ConfiguredRecorder {
  const recorder = createRecorder()
  recorder.use(createForcedReflowCollector())
  recorder.use(createLongTasksCollector())
  recorder.use(createLayoutShiftCollector())
  recorder.use(createNetworkCollector())
  recorder.use(createWebVitalsCollector())
  recorder.use(createRenderCollector())
  const selfProfiler = createSelfProfilingCollector()
  recorder.use(selfProfiler)
  const heap = createHeapCollector()
  recorder.use(heap)
  const interaction = createInteractionCollector()
  recorder.use(interaction)
  const frame = createFrameCollector()
  recorder.use(frame)

  // Assemble interactions first so self-profiling can attribute their
  // processing windows, then attach the heap series and frame timestamps.
  const finalize = (result: RecordingResult): Promise<RecordingResult> =>
    Promise.resolve(interaction.finalize(result))
      .then((r) => selfProfiler.finalize(r))
      .then((r) => heap.finalize(r))
      .then((r) => frame.finalize(r))

  return { recorder, finalize }
}
