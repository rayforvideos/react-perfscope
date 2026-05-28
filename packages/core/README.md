# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals.

## Status

Phase 2 complete — `@react-perfscope/core` ships all 6 core collectors (forced-reflow, long-tasks, layout-shift, network, web-vitals, paint) with deferred stack parsing and synchronous dirty tracking on forced-reflow.

**Forced-reflow note:** Synchronous dirty tracking via `MutationObserver.takeRecords()` ensures the collector only emits when DOM mutated since the last layout read. Stack parsing is deferred until `signal.stack` is accessed.

**Paint collector note:** Phase 2 emits paint entries with a zero-sized `rect` placeholder. Real mutated-region geometry arrives with the UI package in Phase 3.

The `render` signal is owned by the upcoming `@react-perfscope/react` package (Phase 3) and not yet emitted.

## Example

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createPaintCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createForcedReflowCollector())
recorder.use(createLongTasksCollector())
recorder.use(createLayoutShiftCollector())
recorder.use(createNetworkCollector())
recorder.use(createWebVitalsCollector())
recorder.use(createPaintCollector())

recorder.start()
// ... user interaction ...
const result = recorder.stop()

console.log(result.signals)
```
