# @react-perfscope/core

> [English README](./README.md)

`react-perfscope`의 핵심 레코딩 엔진. `Recorder`와 플러그인 방식의 `Collector`를 제공해서 정규화된 성능 신호를 내보낸다.

## 상태

Phase 2 완료 — `@react-perfscope/core`에 6개 collector가 전부 포함됐다 (forced-reflow, long-tasks, layout-shift, network, web-vitals, paint). 스택 파싱은 지연 처리되고, forced-reflow는 동기적으로 dirty 추적을 한다.

**forced-reflow 참고:** `MutationObserver.takeRecords()`를 이용한 동기 dirty 추적으로, 마지막 레이아웃 읽기 이후 DOM이 실제로 변경됐을 때만 신호를 내보낸다. 스택 파싱은 `signal.stack`에 접근할 때까지 미뤄진다.

**paint collector 참고:** Phase 2에서는 paint 항목을 크기가 0인 `rect` 플레이스홀더와 함께 내보낸다. 실제 변경 영역 geometry는 Phase 3에서 UI 패키지와 함께 들어온다.

`render` 신호는 곧 나올 `@react-perfscope/react` 패키지(Phase 3)가 담당하고, 아직 내보내지 않는다.

## 예제

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createPaintCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createForcedReflowCollector())
recorder.use(createLongTasksCollector())
recorder.use(createLayoutShiftCollector())
recorder.use(createNetworkCollector())
recorder.use(createWebVitalsCollector())
recorder.use(createPaintCollector())

recorder.start()
// ... 유저 인터랙션 ...
const result = recorder.stop()

console.log(result.signals)
```
