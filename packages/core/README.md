# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals (forced-reflow, long-task, layout-shift, network, web-vital, interaction).

## Install

```sh
npm install @react-perfscope/core
```

## Usage

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createForcedReflowCollector())
recorder.use(createLongTasksCollector())
recorder.use(createLayoutShiftCollector())
recorder.use(createNetworkCollector())
recorder.use(createWebVitalsCollector())

recorder.start()
// ... user interaction ...
const result = recorder.stop()

console.log(result.signals)
```

## Source-map resolution

`createSourceMapResolver()` returns an async resolver that follows `//# sourceMappingURL=` references (including inline `data:` URIs) and resolves a `StackFrame` to its original source position, so bundled stack traces become readable. Falls back to the input frame on any failure.

```ts
import { createSourceMapResolver } from '@react-perfscope/core'

const resolver = createSourceMapResolver()
const original = await resolver.resolve(parsedFrame)
```

---

<a id="한국어"></a>

# 한국어

`react-perfscope`의 핵심 레코딩 엔진. `Recorder`와 플러그인 방식의 `Collector`를 제공해서 정규화된 성능 신호(forced-reflow, long-task, layout-shift, network, web-vital, interaction)를 내보낸다.

## 설치

```sh
npm install @react-perfscope/core
```

## 사용법

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createForcedReflowCollector())
recorder.use(createLongTasksCollector())
recorder.use(createLayoutShiftCollector())
recorder.use(createNetworkCollector())
recorder.use(createWebVitalsCollector())

recorder.start()
// ... 유저 인터랙션 ...
const result = recorder.stop()

console.log(result.signals)
```

## Source-map 해석

`createSourceMapResolver()`는 `//# sourceMappingURL=` 참조(inline `data:` URI 포함)를 따라가서 `StackFrame`을 원본 소스 위치로 해석해주는 async resolver를 반환한다. 덕분에 번들된 스택 트레이스를 읽을 수 있다. 실패하면 원본 frame을 그대로 반환한다.

```ts
import { createSourceMapResolver } from '@react-perfscope/core'

const resolver = createSourceMapResolver()
const original = await resolver.resolve(parsedFrame)
```
