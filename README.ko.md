# react-perfscope

> [English README](./README.md)

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

## 설계

아키텍처 문서는 `docs/superpowers/specs/`에 있습니다. 각 페이즈의 구현 계획은 `docs/superpowers/plans/`에 있어요. 전체 그림이 궁금하면 거기를 보세요.

## 상태

배포 직전 (`0.1.0`). 135개 테스트 모두 통과; 6개 패키지 모두 typecheck/build 클린. 프로덕션 안전성: `NODE_ENV === 'production'`이면 auto 부트스트랩이 자동으로 빠지고, 빌드 플러그인도 dev 모드 외에는 no-op입니다.

## 개발

```sh
pnpm install
pnpm test          # vitest, 135 tests
pnpm typecheck     # 패키지별 tsc --noEmit
pnpm build         # 패키지별 tsup (packages/*만 필터링)
```

## 라이선스

MIT.
