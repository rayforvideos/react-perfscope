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

## What's in the panel

Click any row to expand its detail. Each signal kind shows different info:

- **forced-reflow** — call stack (top 8 frames) showing where the layout was forced
- **layout-shift** — CLS value + each source rect's x/y/w/h
- **long-task** — start/end/duration, plus call stack if captured
- **network** — full URL, transfer size, render-blocking flag
- **paint** — paint name (first-paint / first-contentful-paint)
- **web-vital** — metric name, value with unit, rating (good/needs/poor) dot per [Google thresholds](https://web.dev/vitals/)
- **render** — component, reason, duration, timestamp

The `render` tab also offers **Group by component** (collapsing many commits of the same component into one row); the `forced-reflow` tab offers **Group by source** (grouping reflows by their originating call site).

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

## 패널 안에 뭐가 있나

신호 row를 클릭하면 디테일이 펼쳐진다. 종류별로 다른 정보를 보여준다:

- **forced-reflow** — 레이아웃을 강제한 호출 스택 (상위 8개 프레임)
- **layout-shift** — CLS 값 + 각 source rect의 x/y/w/h
- **long-task** — 시작/끝/duration, 캡처된 스택이 있으면 같이 표시
- **network** — 전체 URL, transfer size, render-blocking 여부
- **paint** — paint 이름 (first-paint / first-contentful-paint)
- **web-vital** — 메트릭 이름, 단위 포함된 값, [Google 기준](https://web.dev/vitals/)에 따른 등급 (good/needs/poor) 색 점
- **render** — 컴포넌트, reason, duration, 타임스탬프

`render` 탭에는 **Group by component** (같은 컴포넌트의 여러 commit을 한 row로 묶음), `forced-reflow` 탭에는 **Group by source** (같은 call site에서 발생한 reflow끼리 묶음) 옵션도 있다.

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
