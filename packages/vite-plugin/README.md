# @react-perfscope/vite

Vite plugin that auto-injects `react-perfscope/auto` into your HTML entry in dev mode.

## Install

```sh
npm install -D @react-perfscope/vite react-perfscope
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [
    reactPerfscope(),
    react(),
  ],
})
```

The plugin is a no-op in `vite build` (production). In `vite serve`, it adds a `<script type="module" src="/@id/react-perfscope/auto">` to the HTML head so the bootstrap loads before your app's entry.

---

<a id="한국어"></a>

# 한국어

dev 모드에서 HTML 엔트리에 `react-perfscope/auto`를 자동으로 주입하는 Vite 플러그인.

## 설치

```sh
npm install -D @react-perfscope/vite react-perfscope
```

## 사용법

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [
    reactPerfscope(),
    react(),
  ],
})
```

`vite build`(프로덕션)에서는 no-op이다. `vite serve`에서는 HTML `<head>`에 `<script type="module" src="/@id/react-perfscope/auto">`를 추가해서 부트스트랩이 앱 엔트리보다 먼저 실행되도록 한다.
