# @react-perfscope/vite

> [한국어 README](./README.ko.md)

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
