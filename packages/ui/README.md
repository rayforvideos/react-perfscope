# @react-perfscope/ui

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

---

<a id="한국어"></a>

# 한국어

`react-perfscope`용 플로팅 위젯 UI. Shadow DOM으로 격리된 Preact 트리를 페이지에 마운트한다. 성능 신호를 기록하고, 종류별 탭 패널로 표시하고, 영향을 받은 DOM 영역을 오버레이 직사각형으로 하이라이트한다.

## 상태

Phase 4 — 초기 구현. 7가지 신호 종류를 지원한다 (forced-reflow, layout-shift, long-task, paint, network, web-vital, render). 오버레이 geometry는 `layout-shift.sources`에 구현됐고, 다른 종류는 Phase 5에서 실제 geometry가 들어온다.

## 빠르게 시작하기

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

const recorder = createRecorder()
recorder.use(createRenderCollector())

const unmount = mount({ recorder })
// ... 나중에 제거하려면:
// unmount()
```

## API

- `mount({ recorder, position?, host? })` — unmount 함수를 반환한다.
  - `position`: `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`. 기본값은 `'bottom-right'`.
  - `host`: Shadow DOM 호스트를 붙일 부모 엘리먼트. 기본값은 `document.body`.
- `mountShadow(vnode, { parent? })` — 저수준: 새 Shadow Root에 Preact vnode를 마운트한다. unmount 함수를 반환.
- `showOverlay(id, rect)` / `hideOverlay(id)` / `hideAllOverlays()` — DOM 오버레이 기본 함수. 커스텀 UI에 활용할 수 있다.
- `App`, `Panel`, `Widget` — 고급 조합을 위해 export된 Preact 컴포넌트들.

## 참고

- UI는 **Preact**로 만들어졌다 (React 아님). 그래서 React 커밋을 감지하는 render collector가 위젯 자체의 렌더는 잡지 않는다.
- Shadow Root는 `mode: 'open'`이라 테스트와 DevTools에서 트리를 들여다볼 수 있다.
- 오버레이는 Shadow DOM 바깥(즉 `document.body`)에 있어서 호스트 페이지의 어떤 엘리먼트 위에도 레이어를 올릴 수 있다.
