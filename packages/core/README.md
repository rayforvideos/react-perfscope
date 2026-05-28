# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals.

## Status

Phase 1 — minimal implementation. Forced-reflow and long-tasks collectors only.

**Phase 2 update:** The forced-reflow collector now uses synchronous dirty tracking via `MutationObserver.takeRecords()` — it only emits when a DOM mutation occurred since the last layout read. Stack parsing is deferred until `signal.stack` is accessed, keeping per-signal cost low.

**Paint collector caveat:** Phase 2 emits paint entries with a zero-sized `rect` placeholder. Real mutated-region geometry arrives with the UI package in Phase 3, which will pair paint events with MutationObserver records to compute affected regions.

## Example

```ts
import {
  createRecorder,
  createLongTasksCollector,
  createForcedReflowCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createLongTasksCollector())
recorder.use(createForcedReflowCollector())

recorder.start()
// ... user interaction ...
const result = recorder.stop()

console.log(result.signals)
```
