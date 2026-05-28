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

## Design

The architecture is documented in `docs/superpowers/specs/`. Each phase has a plan in `docs/superpowers/plans/`. Read those for the full picture.

## Status

Pre-publish (`0.1.0`). All 135 tests pass; all 6 packages typecheck and build cleanly. Production safety: the auto bootstrap bails when `NODE_ENV === 'production'`, and the build plugins are no-ops outside dev.

## Development

```sh
pnpm install
pnpm test          # vitest, 135 tests
pnpm typecheck     # tsc --noEmit per package
pnpm build         # tsup per package (filtered to packages/*)
```

## License

MIT.
