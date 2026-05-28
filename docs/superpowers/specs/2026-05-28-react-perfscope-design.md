# react-perfscope — Design

**Status:** Draft
**Date:** 2026-05-28
**Owner:** ray

## Summary

`react-perfscope`는 React 18+ 앱의 dev 환경에서 렌더링/네트워크 성능 신호 7가지를 한 화면에 시각화하는 npm 패키지다. 화면 모서리에 떠있는 위젯에서 녹화를 시작/종료하면, 강제 리플로우·레이아웃 시프트·롱 태스크·페인트 영역·웹 바이탈·네트워크 워터폴·React 컴포넌트 re-render 신호가 모두 수집되고, 각 신호는 호출 스택·소스 파일/라인·React 컴포넌트 이름·DOM 요소까지 매핑된다.

## Problem

브라우저는 이미 성능 관련 신호를 다양하게 제공한다. Chrome DevTools에 forced reflow insights, Layout Shift Regions, Paint Flashing, Performance/Network 탭이 다 있다. 하지만:

- **신호가 흩어져 있다** — 7개 신호를 보려면 5개 패널을 오가야 한다
- **묻혀있다** — Forced reflow는 Performance 탭 사이드바 깊숙히, Paint Flashing은 Rendering 패널 안. 알아야 보인다
- **원인 추적이 약하다** — DevTools가 시그널을 보여주긴 해도 "이 컴포넌트가 원인" 같은 매핑은 React DevTools를 또 띄워야 한다
- **프레임워크 무관 도구는 expert tool** — Million Lint는 React 한정 + 재렌더만, Why Did You Render는 console 출력만

`react-perfscope`는 dev 모드에서 한 번 import하면, 위젯 클릭 한 번에 7가지 신호를 모아주고 각 신호를 React 컴포넌트와 소스 라인까지 짚어준다.

## Non-goals

- 프로덕션 모니터링 (Sentry, DataDog 영역)
- React 외 프레임워크 (Vue/Svelte 등) — 후속 패키지로 분리 가능하지만 이번 spec 범위 아님
- 녹화 세션 저장/공유/diff — 보기만 (사용자 결정)
- CI/CD 통합 (Lighthouse CI 같은 회귀 검사)
- 자동 최적화 제안/수정 (AI 자동 fix)

## Decisions Recorded

| 항목 | 결정 |
|---|---|
| 이름 | `react-perfscope` |
| 추적 신호 | 7가지 풀세트 (forced reflow, layout shift, long tasks, paint, web vitals, network, render) |
| 프레임워크 | React 18+ |
| 배포 형태 | npm 패키지 + Vite/Webpack 플러그인 |
| UI 위치 | 화면 모서리 플로팅 위젯 |
| 원인 추적 | 시간 + 호출 스택 + 소스 라인 + 컴포넌트 이름 + DOM 요소 하이라이트 |
| 데이터 수집 | 명시적 녹화 (Start/Stop) |
| 녹화 트리거 | 위젯 버튼 클릭 |
| 데이터 보존 | 보기만 (저장/export/import 없음) |
| 성능 오버헤드 | 만들면서 튜닝, 정확도 우선 |
| 모노레포 도구 | pnpm workspace, tsup, changeset, vitest |

## Architecture

모노레포 구성. 각 패키지는 단일 책임. 메타 패키지가 사용자 입구.

```
react-perfscope/
├── packages/
│   ├── core/                     # @react-perfscope/core
│   │   ├── collectors/
│   │   │   ├── forced-reflow.ts
│   │   │   ├── layout-shift.ts
│   │   │   ├── long-tasks.ts
│   │   │   ├── paint.ts
│   │   │   ├── web-vitals.ts
│   │   │   └── network.ts
│   │   ├── recorder.ts
│   │   ├── types.ts
│   │   └── sourcemap.ts
│   ├── react/                    # @react-perfscope/react
│   │   ├── fiber-walker.ts
│   │   ├── render-collector.ts
│   │   └── attribution.ts
│   ├── ui/                       # @react-perfscope/ui
│   │   ├── widget/
│   │   ├── overlay/
│   │   ├── panel/
│   │   └── index.tsx
│   ├── vite/                     # @react-perfscope/vite
│   │   └── index.ts
│   ├── webpack/                  # @react-perfscope/webpack
│   │   └── index.ts
│   └── react-perfscope/          # 메타 패키지
│       └── index.ts
├── examples/
│   ├── vite-react/
│   └── webpack-cra/
├── docs/superpowers/specs/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

### 패키지 의존성

```
react-perfscope (메타)
  ├── @react-perfscope/core
  ├── @react-perfscope/react   → core
  ├── @react-perfscope/ui      → core, react
  ├── @react-perfscope/vite    → (peer: 위 3개)
  └── @react-perfscope/webpack → (peer: 위 3개)
```

### 도구 선택

- **pnpm workspace** — 모노레포 표준
- **tsup** — 패키지별 빌드 (esm + cjs + dts)
- **changeset** — 버전 관리, 릴리즈 노트
- **vitest** — 테스트
- **Playwright** — 브라우저 E2E
- **TypeScript** — 전 패키지 TS

## Components

### `@react-perfscope/core`

**책임:** 7개 신호 수집 + 표준화 + 녹화 세션 버퍼링.

**핵심 타입:**

```ts
type Signal =
  | { kind: 'forced-reflow'; at: number; duration: number; stack: StackFrame[] }
  | { kind: 'layout-shift'; at: number; value: number; sources: DOMRect[] }
  | { kind: 'long-task'; at: number; duration: number; stack: StackFrame[] }
  | { kind: 'paint'; at: number; rect: DOMRect; cause: 'style' | 'layout' | 'unknown' }
  | { kind: 'web-vital'; name: 'LCP'|'FID'|'INP'|'CLS'|'FCP'|'TTFB'; value: number }
  | { kind: 'network'; url: string; startedAt: number; duration: number; size: number; blocking: boolean }
  | { kind: 'render'; at: number; component: string; reason: string; duration: number }

type StackFrame = { file: string; line: number; col: number; fnName?: string }

interface Recorder {
  start(): void
  stop(): RecordingResult
  isRecording(): boolean
  onSignal(cb: (s: Signal) => void): () => void
}

interface RecordingResult {
  signals: Signal[]
  startedAt: number
  duration: number
}
```

**Collector 구현 매핑:**

| Collector | 기법 |
|---|---|
| forced-reflow | `PerformanceObserver({ type: 'longtask' })` + monkey-patch (offsetWidth/getBoundingClientRect 등) |
| layout-shift | `PerformanceObserver({ type: 'layout-shift' })` |
| long-tasks | `PerformanceObserver({ type: 'longtask' })` |
| paint | `PerformanceObserver({ type: 'paint' })` + `MutationObserver` |
| web-vitals | `web-vitals` 라이브러리 dependency |
| network | `PerformanceObserver({ type: 'resource' })` |
| render | (react 패키지에서 emit) |

### `@react-perfscope/react`

**책임:** React 18+ Fiber tree 접근, 컴포넌트 이름/위치 매핑, re-render 추적.

```ts
interface ReactAdapter {
  install(): void
  resolveComponentFromElement(el: HTMLElement): string | null
  startRenderTracking(emit: (s: Signal) => void): () => void
}
```

**구현 포인트:**

- `__REACT_DEVTOOLS_GLOBAL_HOOK__`에 등록 (이미 등록된 훅이 있으면 chain)
- `onCommitFiberRoot` 콜백에서 변경된 fiber 순회 → render Signal emit
- Fiber 노드의 `_debugSource`(dev build에만 존재) 또는 `type.displayName`/`type.name`으로 컴포넌트 식별
- React DevTools와 공존 (서로 깨지지 않도록 wrap)

### `@react-perfscope/ui`

**책임:** 시각화 — 위젯, 오버레이, 결과 패널.

```ts
interface MountOptions {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  recorder: Recorder
  reactAdapter?: ReactAdapter
}

function mount(opts: MountOptions): () => void
```

**구현 포인트:**

- Shadow DOM에 mount → 호스트 앱 CSS 충돌 0
- **Preact**로 작성 (React를 모니터링하는 도구가 React로 작성되면 자기 자신을 잡는 무한 루프/오염 위험)
- 위젯: 평소엔 작은 ● 버튼, 클릭 시 녹화 토글
- 패널: 녹화 종료 후 펼침, 7개 신호 탭
- DOM 하이라이트: 페이지 위 fixed div로 빨간 박스

### `@react-perfscope/vite` + `webpack`

**책임:** 자동 주입.

- Vite: HTML transform으로 entry 앞에 `import 'react-perfscope/auto'` 주입
- Webpack: entry 변환으로 동일 import 추가
- `mode === 'development'`에서만 작동
- sourcemap 활성화 강제 (없으면 경고)

### `react-perfscope` (메타)

**책임:** "그냥 다 한 번에 쓰고 싶어요" 사용자용 입구.

```ts
// react-perfscope/auto.ts
import { createRecorder } from '@react-perfscope/core'
import { createReactAdapter } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

if (process.env.NODE_ENV === 'development') {
  const recorder = createRecorder()
  const reactAdapter = createReactAdapter()
  reactAdapter.install()
  mount({ recorder, reactAdapter })
}
```

## Data Flow

### 1) 부트스트랩

```
[Vite/Webpack plugin]
  → 빌드 시 entry 앞에 'react-perfscope/auto' 주입
  → dev 모드만

[브라우저 로드]
  auto.ts 실행
    ├─ Recorder 생성
    ├─ ReactAdapter.install()
    │     ↳ __REACT_DEVTOOLS_GLOBAL_HOOK__ 등록
    └─ UI mount (Shadow DOM, 위젯만 노출)
```

### 2) 녹화 시작

```
Widget click
  → Recorder.start()
       ├─ 7개 collector activate
       ├─ ReactAdapter.startRenderTracking(emit)
       ├─ MutationObserver activate
       └─ monkey-patch on
```

### 3) 신호 수집

```
[브라우저 이벤트]
  PerformanceObserver(layout-shift) → entry
    → collectors/layout-shift.ts
      → normalize → Signal
      → Recorder.buffer.push(signal)

  React commit
    → ReactAdapter.onCommitFiberRoot
      → 변경 fiber 순회 → render Signal emit
      → Recorder.buffer.push
```

모든 신호는 메모리 버퍼에만 (네트워크 전송 없음).

### 4) Attribution

```
Signal에 stack: Error().stack 포함
  → core/sourcemap.ts
    → 브라우저 sourcemap 자동 resolve
    → StackFrame[] (file:line:col + fnName)

DOM 요소를 가진 Signal (layout-shift, paint)
  → react/attribution.ts
    → element → fiber 역추적 → 컴포넌트 이름
    → signal.component 필드 추가
```

### 5) 녹화 종료

```
Widget click (recording 중)
  → Recorder.stop()
       ├─ 모든 collector deactivate
       ├─ observer disconnect
       ├─ monkey-patch off
       └─ RecordingResult 반환

UI 패널 펼침
  → 7개 탭 렌더링
  → signal hover/click
    → DOM 요소 빨간 박스 표시
    → 스택 + 컴포넌트 + 소스 라인 펼침
```

### 6) 데이터 휘발

페이지 새로고침 / 다음 녹화 시작 시 이전 결과 버림.

### 메모리 모델

```
PerfscopeRuntime (싱글톤)
├── Recorder
│   └── signals: Signal[]
├── ReactAdapter (no state, listeners)
└── UI
    ├── widget DOM (Shadow root)
    ├── overlay DOM
    └── lastResult: RecordingResult | null
```

**버퍼 상한:** 10,000 signals. 초과 시 가장 오래된 것 drop + 패널 경고. (실제 수치는 만들면서 튜닝)

## Error Handling

### 원칙

도구는 호스트 앱을 절대 죽이지 않는다. 모든 에러는 격리, 콘솔 경고로만, throw 금지.

### 시나리오

| 상황 | 처리 |
|---|---|
| `PerformanceObserver` 미지원 | 해당 collector 비활성, 나머지 정상, 콘솔 경고 1회 |
| `__REACT_DEVTOOLS_GLOBAL_HOOK__` 이미 등록 | 기존 훅 chain |
| React DevTools 동시 사용 | 둘 다 commit 콜백 받게 wrap |
| React 18 미만 | React 의존 신호 비활성, 콘솔 경고 |
| Sourcemap 없음/깨짐 | minified stack 그대로 표시, 패널에 안내 |
| Shadow DOM 미지원 | UI mount 포기, 콘솔 경고 |
| Collector 내부 에러 | `try/catch` 격리, 해당 collector만 비활성 |
| 버퍼 폭발 | 오래된 시그널 drop, 패널 경고 |
| 글로벌 `Error.prepareStackTrace` 충돌 | wrap 후 원복. 충돌 시 stack 캡처 포기 |
| Prod 빌드에 들어감 | 메타 패키지가 `NODE_ENV !== 'development'`면 no-op. 플러그인도 dev 모드만 주입 (이중 안전장치) |
| 플러그인 entry 변환 실패 | 빌드는 막지 않고 경고. 수동 import 안내 |
| Sourcemap fetch 느림 | 비동기 lazy resolve, 신호 먼저 표시 |

### 에러 표시 채널

1. **콘솔 경고** — `[react-perfscope] ...` prefix 통일
2. **위젯 빨간 점** — 비활성 collector 있을 때 표시, hover로 이유 노출
3. **패널 배너** — 결과 위에 "일부 정보 누락" 안내

### 안티패턴 방지

- 호스트 앱 에러처럼 throw 금지
- 글로벌 prototype 영구 패치 금지 (monkey-patch는 녹화 중에만, 끝나면 원복)
- 무한 루프 방지 (UI는 Preact, 자기 자신 모니터링 X)

## Testing

### 레벨

| 레벨 | 도구 | 목적 |
|---|---|---|
| Unit | Vitest | 순수 함수, 타입 변환, 버퍼 로직 |
| Integration | Vitest + happy-dom/jsdom | Collector + Recorder 결합 (PerformanceObserver는 mock) |
| Browser E2E | Playwright | 실제 브라우저에서 신호 → 위젯 표시 |
| Visual regression | Playwright screenshots | 위젯/오버레이/패널 |
| Example integration | examples/* 빌드 | 플러그인 주입 검증 |

### 패키지별 초점

**`core/`**
- `Recorder.start/stop` 상태 머신 (idempotent)
- Collector raw 이벤트 → Signal 변환
- Sourcemap 파싱
- 버퍼 상한 초과 drop
- monkey-patch on/off 후 원본 복원

**`react/`**
- Fiber walker가 Suspense, Portal, memo, lazy 처리
- React DevTools 공존
- React 17 이하 감지 시 graceful disable

**`ui/`**
- Shadow DOM 격리
- 위젯 토글 동작
- 패널 7개 탭 렌더링
- Overlay 박스 좌표 정확
- 시각 회귀

**`vite/` + `webpack/`**
- 예제 빌드로 주입 검증
- prod 모드 미주입
- sourcemap 없을 때 경고

### Playwright E2E 핵심 시나리오

1. examples/vite-react 실행
2. 페이지 진입 → 위젯 표시
3. ● 클릭 → 녹화 시작
4. 의도적 트리거 (forced reflow 일으키는 버튼 클릭)
5. ● 다시 클릭 → 녹화 종료
6. 패널 열림 확인
7. 'forced-reflow' 탭에 신호 ≥ 1
8. 신호 클릭 → 빨간 박스가 올바른 요소에 표시
9. 스택 펼침 → 원본 파일:라인 노출

### 어려운 부분

| 어려움 | 대응 |
|---|---|
| `PerformanceObserver`는 jsdom/happy-dom에 없음 | unit/integration은 mock, 실동작은 Playwright |
| 실제 forced reflow 강제 발생 | examples에 트리거 버튼 추가 |
| React Fiber 내부 의존 | 버전별 스냅샷, 마이너 업데이트마다 회귀 |
| 시간 의존 | `waitForFunction` 사용, 절대 시간 단언 금지 |

### CI 구성

- PR마다: unit + integration (빠름)
- PR마다: Playwright (Chromium 1개)
- 메인 머지 후: Chromium + Firefox + WebKit 풀세트
- 릴리즈 전: examples 빌드 검증

### 커버리지 목표

- core, react: 80%+
- ui: 시각 회귀 위주
- plugin: 예제 빌드 통과로 커버

## Open Questions

- 버퍼 상한 10,000 수치는 실제 사용에서 조정 필요
- `web-vitals` 라이브러리 dependency 버전 핀 정책
- sourcemap resolution을 메인 스레드에서 sync로 할지, Web Worker에 떠넘길지 (성능 보고 결정)
- React 18.x 마이너 업데이트 회귀 빈도 (필요시 자동화)
