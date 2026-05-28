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

---

<a id="한국어"></a>

# 한국어

`react-perfscope`용 React 18+ 어댑터. DevTools 글로벌 훅을 설치해 커밋을 감지하고, fiber 트리를 순회해서 `@react-perfscope/core`에 연결되는 render collector를 제공한다.

## 상태

Phase 3-4 안정화. render collector는 커밋마다 변경된 컴포넌트 하나당 `RenderSignal` 하나를 내보낸다. React가 Profiling 빌드일 경우 `RenderSignal.duration`은 `fiber.actualDuration`으로 채워진다.

## 예제

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

## API

- `createRenderCollector()` — Collector 팩토리. React 커밋마다 non-host fiber에 대해 `RenderSignal`을 내보낸다.
- `resolveComponentFromElement(el)` — DOM 엘리먼트를 받아 가장 가까운 React 컴포넌트 이름을 반환한다 (fiber가 없으면 null).
- `installDevToolsHook(listener)` — 저수준 DevTools 훅 설치 함수. unsubscribe 함수를 반환한다. 기존에 있던 훅(예: 실제 React DevTools)이 있으면 체이닝한다.
- `fiberComponentName(fiber)` — fiber를 컴포넌트 이름으로 해석한다. host 태그, 함수/클래스 컴포넌트, `memo`, `forwardRef`를 모두 처리한다.
- `walkChangedFibers(root, visit, { stopAt })` — 상한선을 두고 fiber 서브트리를 깊이 우선으로 순회한다.

## 훅 로드 순서 (중요)

`react-dom`은 모듈 평가 시점에 `globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 딱 한 번 읽는다. 그 시점에 훅이 없으면 `react-dom` 내부의 `injectedHook`이 `null`로 고정되어 이후에 업데이트되지 않는다 — 그러면 collector가 커밋을 영원히 못 받는다.

**실용적인 의미:** `@react-perfscope/react`를 import하거나 `createRenderCollector()` / `installDevToolsHook()`를 호출하는 건 반드시 `import 'react-dom/client'`보다 먼저, 그리고 그걸 import하는 어떤 모듈보다도 먼저 와야 한다. 가장 간단한 패턴:

```ts
// entry 파일 맨 위에
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

// 이제 React-DOM을 건드리는 코드를 import
import './app'
```

`react-perfscope` 메타 패키지(또는 빌드 플러그인 중 하나)를 쓰면 이 순서가 자동으로 처리된다.

## 주의사항

- render collector는 deactivate 사이클에도 DevTools 훅 리스너를 붙여둔다 (내보내기는 `active` 플래그로 제어된다). 이건 `web-vitals` collector의 생명주기와 같은 방식이다.
- Profiler가 활성화된 root 바깥에 있는 fiber는 `RenderSignal.duration`이 `0`이다 (개발 모드의 `createRoot`는 기본적으로 Profiler가 켜져 있다).
