# @react-perfscope/react

React 18+ adapter for `react-perfscope`. Installs a DevTools global hook to observe commits, walks fiber trees, and exposes a render collector that plugs into `@react-perfscope/core`.

## Status

Phase 3 — initial implementation. Render collector emits one `RenderSignal` per changed component per commit. Duration is a Phase 3 placeholder (always 0); Phase 4 will pair with React Profiler timings.

## Example

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

recorder.start()
// ... interact with the app ...
const result = recorder.stop()

console.log(result.signals.filter((s) => s.kind === 'render'))
```

## API

- `createRenderCollector()` — Collector factory. Emits `RenderSignal` per non-host fiber on each React commit.
- `resolveComponentFromElement(el)` — Given a DOM element, return the nearest React component name (or null if no fiber attached).
- `installDevToolsHook(listener)` — Low-level DevTools hook installer. Returns an unsubscribe function. Chains with any pre-existing hook (e.g. real React DevTools).
- `fiberComponentName(fiber)` — Resolve a fiber to its component name. Handles host tags, function/class components, `memo`, `forwardRef`.
- `walkChangedFibers(root, visit, { stopAt })` — Depth-first traversal of a fiber subtree with an upper bound.

## Caveats

- `RenderSignal.duration` is always `0` in Phase 3. Wiring real timings (via React Profiler API) is Phase 4.
- The render collector keeps its DevTools hook listener attached across deactivate cycles (emission is gated by an `active` flag). This mirrors the `web-vitals` collector's lifecycle.
