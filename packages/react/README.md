# @react-perfscope/react

React 18+ render collector for `react-perfscope`. Observes React commits and emits one `RenderSignal` per changed component, plugging into `@react-perfscope/core`.

## Install

```sh
npm install @react-perfscope/react @react-perfscope/core
```

## Usage

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

## Load order (important)

`react-dom` reads the DevTools global hook **once** at module-evaluation time. Import `@react-perfscope/react` (or call `createRenderCollector()`) **before** any code that imports `react-dom/client`, otherwise the collector never receives commits:

```ts
// At the very top of your entry file
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

// Now import React-DOM-touching code
import './app'
```

The `react-perfscope` meta package and the build plugins handle this ordering automatically.

## API

- `createRenderCollector()` — Collector factory. Emits `RenderSignal` per non-host fiber on each React commit.
- `resolveComponentFromElement(el)` — Given a DOM element, return the nearest React component name (or null).
- `installDevToolsHook(listener)` — Low-level DevTools hook installer. Returns an unsubscribe function.
- `fiberComponentName(fiber)` — Resolve a fiber to its component name.
- `walkChangedFibers(root, visit, { stopAt })` — Depth-first traversal of a fiber subtree with an upper bound.

---

<a id="한국어"></a>

# 한국어

`react-perfscope`용 React 18+ render collector. React 커밋을 감지해서 변경된 컴포넌트마다 `RenderSignal` 하나를 내보내고, `@react-perfscope/core`에 연결된다.

## 설치

```sh
npm install @react-perfscope/react @react-perfscope/core
```

## 사용법

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

recorder.start()
// ... 앱과 상호작용 ...
const result = recorder.stop()

console.log(result.signals.filter((s) => s.kind === 'render'))
```

## 로드 순서 (중요)

`react-dom`은 모듈 평가 시점에 DevTools 글로벌 훅을 **딱 한 번** 읽는다. 그래서 `@react-perfscope/react`를 import하거나 `createRenderCollector()`를 호출하는 건 `react-dom/client`를 import하는 어떤 코드보다도 **먼저** 와야 한다. 안 그러면 collector가 커밋을 영원히 못 받는다:

```ts
// entry 파일 맨 위에
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

// 이제 React-DOM을 건드리는 코드를 import
import './app'
```

`react-perfscope` 메타 패키지나 빌드 플러그인을 쓰면 이 순서가 자동으로 처리된다.

## API

- `createRenderCollector()` — Collector 팩토리. React 커밋마다 non-host fiber에 대해 `RenderSignal`을 내보낸다.
- `resolveComponentFromElement(el)` — DOM 엘리먼트를 받아 가장 가까운 React 컴포넌트 이름을 반환한다 (없으면 null).
- `installDevToolsHook(listener)` — 저수준 DevTools 훅 설치 함수. unsubscribe 함수를 반환한다.
- `fiberComponentName(fiber)` — fiber를 컴포넌트 이름으로 해석한다.
- `walkChangedFibers(root, visit, { stopAt })` — 상한선을 두고 fiber 서브트리를 깊이 우선으로 순회한다.
