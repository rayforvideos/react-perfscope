# react-perfscope

Performance debugging tool for React 18+ apps. Records forced reflows, layout shifts, long tasks, paint events, web vitals, network requests, and React component renders during development — and visualises them in a floating UI panel.

## Quickstart

The one-line install for Vite users:

```sh
npm install -D @react-perfscope/vite react-perfscope
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [reactPerfscope(), react()],
})
```

Start the dev server. A floating "rec" button appears in the bottom-right. Click it, interact with your app, click it again — a per-signal-kind panel opens with everything recorded.

Webpack users use `@react-perfscope/webpack` instead — see its README.

If you'd rather wire it manually, install `react-perfscope` and add `import 'react-perfscope/auto'` at the **very top** of your entry file (before `react-dom` is imported).

## Demo

See `examples/vite-react` for a runnable Vite + React demo.

## Packages

This is a pnpm monorepo. Six published packages:

| Package | Description |
|---|---|
| [`react-perfscope`](./packages/meta) | Meta. Re-exports core/react/ui + `react-perfscope/auto` side-effect bootstrap |
| [`@react-perfscope/core`](./packages/core) | Recorder + 6 collectors (forced-reflow, layout-shift, long-task, paint, network, web-vital) + sourcemap utilities |
| [`@react-perfscope/react`](./packages/react) | React 18+ adapter: DevTools global hook, fiber walker, attribution, render collector |
| [`@react-perfscope/ui`](./packages/ui) | Preact + Shadow DOM widget, per-kind tabbed panel, DOM overlay |
| [`@react-perfscope/vite`](./packages/vite-plugin) | Vite plugin: auto-inject in dev |
| [`@react-perfscope/webpack`](./packages/webpack-plugin) | Webpack plugin: auto-inject in dev |

## Status

Published on npm (`0.2.0`). Compatible with React 18 & 19, Vite 5–8, and webpack 5. Production-safe: the auto bootstrap bails when `NODE_ENV === 'production'`, and the build plugins are no-ops outside dev.

## Development

```sh
pnpm install
pnpm test          # vitest, 135 tests
pnpm typecheck     # tsc --noEmit per package
pnpm build         # tsup per package (filtered to packages/*)
```

## License

MIT.

---

<a id="한국어"></a>

# 한국어

React 18+ 앱용 성능 디버깅 도구. 개발 중에 강제 리플로우, 레이아웃 시프트, 롱 태스크, 페인트 이벤트, 웹 바이탈, 네트워크 요청, React 컴포넌트 렌더를 기록하고 플로팅 UI 패널로 시각화합니다.

## 빠르게 시작하기

Vite 사용자의 한 줄 설치:

```sh
npm install -D @react-perfscope/vite react-perfscope
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [reactPerfscope(), react()],
})
```

dev 서버를 띄우면 화면 오른쪽 아래에 떠있는 "rec" 버튼이 보입니다. 클릭하고, 앱을 만지작거리다가, 다시 클릭하면 — 종류별 탭 패널이 열리고 기록된 신호가 전부 표시됩니다.

Webpack 사용자는 `@react-perfscope/webpack`을 쓰세요 — 해당 README 참고.

수동으로 연결하고 싶다면, `react-perfscope`를 설치하고 entry 파일 **가장 맨 위에** `import 'react-perfscope/auto'`를 넣으세요 (`react-dom` import보다 먼저).

## 데모

`examples/vite-react`에 실행 가능한 Vite + React 데모가 있습니다.

## 패키지 구성

pnpm 모노레포입니다. 6개 published 패키지:

| 패키지 | 설명 |
|---|---|
| [`react-perfscope`](./packages/meta) | 메타. core/react/ui를 re-export하고 `react-perfscope/auto` 부트스트랩 제공 |
| [`@react-perfscope/core`](./packages/core) | Recorder + 6개 collector (forced-reflow, layout-shift, long-task, paint, network, web-vital) + sourcemap 유틸 |
| [`@react-perfscope/react`](./packages/react) | React 18+ 어댑터: DevTools 글로벌 훅, fiber walker, attribution, render collector |
| [`@react-perfscope/ui`](./packages/ui) | Preact + Shadow DOM 위젯, 종류별 탭 패널, DOM 오버레이 |
| [`@react-perfscope/vite`](./packages/vite-plugin) | Vite 플러그인: dev 자동 주입 |
| [`@react-perfscope/webpack`](./packages/webpack-plugin) | Webpack 플러그인: dev 자동 주입 |

## 상태

npm 게시됨 (`0.2.0`). React 18·19, Vite 5–8, webpack 5 호환. 프로덕션 안전성: `NODE_ENV === 'production'`이면 auto 부트스트랩이 자동으로 빠지고, 빌드 플러그인도 dev 모드 외에는 no-op입니다.

## 개발

```sh
pnpm install
pnpm test          # vitest, 135 tests
pnpm typecheck     # 패키지별 tsc --noEmit
pnpm build         # 패키지별 tsup (packages/*만 필터링)
```

## 라이선스

MIT.
