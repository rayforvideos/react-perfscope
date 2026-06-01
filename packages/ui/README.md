# @react-perfscope/ui

Floating-widget UI for `react-perfscope`. Mounts a Shadow-DOM-isolated panel into your page that records performance signals, shows them in a per-kind tabbed panel, and highlights affected DOM regions with overlays.

## Install

```sh
npm install @react-perfscope/ui @react-perfscope/core
```

## Usage

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

- **forced-reflow** — call stack showing where layout was forced
- **layout-shift** — CLS value + each source rect
- **long-task** — start/end/duration, plus call stack if captured
- **network** — full URL, transfer size, render-blocking flag
- **paint** — paint name (first-paint / first-contentful-paint)
- **web-vital** — metric name, value, rating per [Google thresholds](https://web.dev/vitals/)
- **render** — component, reason, duration, timestamp

The header has a **Save** button that downloads the full recording as JSON. The `render` tab offers **Group by component** and the `forced-reflow` tab offers **Group by source**.

## API

- `mount({ recorder, position?, host? })` — returns an unmount function.
  - `position`: `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`. Defaults to `'bottom-right'`.
  - `host`: parent element for the Shadow DOM host. Defaults to `document.body`.
- `mountShadow(vnode, { parent? })` — mount any Preact vnode in a fresh Shadow Root. Returns unmount.
- `showOverlay(id, rect)` / `hideOverlay(id)` / `hideAllOverlays()` — DOM overlay primitives.
- `App`, `Panel`, `Widget` — Preact components, exported for advanced composition.

---

<a id="한국어"></a>

# 한국어

`react-perfscope`용 플로팅 위젯 UI. Shadow DOM으로 격리된 패널을 페이지에 마운트해서, 성능 신호를 기록하고 종류별 탭 패널로 표시하고 영향받은 DOM 영역을 오버레이로 하이라이트한다.

## 설치

```sh
npm install @react-perfscope/ui @react-perfscope/core
```

## 사용법

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

- **forced-reflow** — 레이아웃을 강제한 호출 스택
- **layout-shift** — CLS 값 + 각 source rect
- **long-task** — 시작/끝/duration, 캡처된 스택이 있으면 같이 표시
- **network** — 전체 URL, transfer size, render-blocking 여부
- **paint** — paint 이름 (first-paint / first-contentful-paint)
- **web-vital** — 메트릭 이름, 값, [Google 기준](https://web.dev/vitals/)에 따른 등급
- **render** — 컴포넌트, reason, duration, 타임스탬프

헤더의 **Save** 버튼으로 전체 recording을 JSON으로 받을 수 있다. `render` 탭에는 **Group by component**, `forced-reflow` 탭에는 **Group by source** 옵션이 있다.

## API

- `mount({ recorder, position?, host? })` — unmount 함수를 반환한다.
  - `position`: `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`. 기본값은 `'bottom-right'`.
  - `host`: Shadow DOM 호스트를 붙일 부모 엘리먼트. 기본값은 `document.body`.
- `mountShadow(vnode, { parent? })` — 새 Shadow Root에 Preact vnode를 마운트한다. unmount 함수를 반환.
- `showOverlay(id, rect)` / `hideOverlay(id)` / `hideAllOverlays()` — DOM 오버레이 기본 함수.
- `App`, `Panel`, `Widget` — 고급 조합을 위해 export된 Preact 컴포넌트들.
