# react-perfscope 데모 — Vite + React 18

> [English README](./README.md)

`@react-perfscope/vite` + `react-perfscope`를 Vite + React 18 앱에서 쓰는 최소한의 데모.

## 실행

repo 루트에서:

```sh
pnpm install
pnpm --filter @react-perfscope-example/vite-react dev
```

터미널에 출력되는 URL을 열면 된다 (보통 `http://localhost:5173/`).

오른쪽 아래에 플로팅 "rec" 버튼이 보이는데, 그게 react-perfscope 위젯이다. 클릭해서 녹화를 시작하고, 페이지를 만지작거리다가 (Counter 버튼, layout-shifter 버튼), 다시 클릭해서 멈추면 된다. 패널이 열리면서 캡처된 신호가 종류별로 그룹핑된다: render, layout-shift, forced-reflow 등.

## 이 데모에 뭐가 있나

- `Counter`: 클릭할 때마다 React 리렌더가 발생 → `render` 신호.
- `LayoutShifter`: 토글하면 높이가 큰 블록이 삽입/제거됨 → `layout-shift` 신호 (sources 포함). 패널에서 항목 위에 마우스를 올리면 소스 영역이 페이지에 오버레이로 표시된다.

## 연동 방식

`vite.config.ts`에서 `@react-perfscope/vite`를 `@vitejs/plugin-react`보다 앞에 등록한다. dev 모드(`vite serve`)에서는 플러그인이 HTML `<head>` 상단에 `<script type="module">import 'react-perfscope/auto'</script>`를 주입해서 부트스트랩이 모든 작성자 스크립트(`react-dom` 포함)보다 먼저 실행되도록 한다 — DevTools 훅이 캡처되려면 이 순서가 필수다.

프로덕션(`vite build`)에서는 플러그인이 no-op이라 perfscope 코드가 번들에 포함되지 않는다.
