# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals.

## Status

Phase 1 — minimal implementation. Forced-reflow and long-tasks collectors only.

**Phase 1 caveat:** The forced-reflow collector emits on every layout read during recording. It does not yet track whether a preceding style write actually invalidated layout, so non-thrashing reads are also reported. Phase 2 adds proper dirty tracking.

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
