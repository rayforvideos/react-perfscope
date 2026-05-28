# @react-perfscope/ui

> [한국어 README](./README.ko.md)

Floating-widget UI for `react-perfscope`. Mounts a Shadow-DOM-isolated Preact tree into your page. Records performance signals, shows them in a per-kind tabbed panel, and highlights affected DOM regions via overlay rectangles.

## Status

Phase 4 — initial implementation. Supports 7 signal kinds (forced-reflow, layout-shift, long-task, paint, network, web-vital, render). Overlay geometry implemented for `layout-shift.sources`; other kinds gain real geometry in Phase 5.

## Quickstart

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

const recorder = createRecorder()
recorder.use(createRenderCollector())

const unmount = mount({ recorder })
// ... later, to remove:
// unmount()
```

## API

- `mount({ recorder, position?, host? })` — returns an unmount function.
  - `position`: `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`. Defaults to `'bottom-right'`.
  - `host`: parent element to attach the Shadow DOM host. Defaults to `document.body`.
- `mountShadow(vnode, { parent? })` — low-level: mount any Preact vnode in a fresh Shadow Root. Returns unmount.
- `showOverlay(id, rect)` / `hideOverlay(id)` / `hideAllOverlays()` — DOM overlay primitives. Useful for custom UIs.
- `App`, `Panel`, `Widget` — Preact components, exported for advanced composition.

## Notes

- The UI is built in **Preact** (not React) so the render collector — which observes React commits — doesn't pick up our own widget renders.
- The Shadow Root uses `mode: 'open'` so tests and devtools can inspect the tree.
- The overlay lives outside the Shadow DOM (in `document.body`) so it can layer over arbitrary host-page elements.
