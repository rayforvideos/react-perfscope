# @react-perfscope/react

React 18+ adapter for `react-perfscope`. Installs a DevTools global hook to observe commits, walks fiber trees, and exposes a render collector that plugs into `@react-perfscope/core`.

## Status

Phase 3-4 stable. Render collector emits one `RenderSignal` per changed component per commit; `RenderSignal.duration` populated from `fiber.actualDuration` when React is built with Profiling.

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

## Hook load-order (IMPORTANT)

`react-dom` reads `globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__` ONCE at module evaluation time. If the hook isn't there at that moment, `react-dom`'s internal `injectedHook` is set to `null` and never updated — our collector will then never receive commits.

**Practical implication:** import `@react-perfscope/react` (or call `createRenderCollector()` / `installDevToolsHook()`) BEFORE you `import 'react-dom/client'` or before any module that does. The simplest pattern:

```ts
// At the very top of your entry file
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

// Now import React-DOM-touching code
import './app'
```

If you're using the `react-perfscope` meta package (or one of the build plugins), this ordering is handled automatically.

## Caveats

- The render collector keeps its DevTools hook listener attached across deactivate cycles (emission is gated by an `active` flag). This mirrors the `web-vitals` collector's lifecycle.
- `RenderSignal.duration` is `0` for fibers outside a Profiler-enabled root (React's default `createRoot` is Profiler-enabled in development).
