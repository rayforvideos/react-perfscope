# react-perfscope demo — Vite + React 18

> [한국어 README](./README.ko.md)

Minimal demo showing `@react-perfscope/vite` + `react-perfscope` in a Vite + React 18 app.

## Run

From the repo root:

```sh
pnpm install
pnpm --filter @react-perfscope-example/vite-react dev
```

Then open the printed URL (typically `http://localhost:5173/`).

A floating "rec" button appears in the bottom-right corner — that's the react-perfscope widget. Click it to start recording, interact with the page (Counter button, layout-shifter button), then click again to stop. The panel that opens groups captured signals by kind: render, layout-shift, forced-reflow, etc.

## What's in this demo

- `Counter`: each click triggers a React re-render → `render` signal.
- `LayoutShifter`: toggling inserts/removes a tall block → `layout-shift` signal with sources. Hover the entry in the panel to see the source region overlaid on the page.

## How the integration is wired

`vite.config.ts` registers `@react-perfscope/vite` ahead of `@vitejs/plugin-react`. In dev mode (`vite serve`), the plugin injects a `<script type="module">import 'react-perfscope/auto'</script>` at the top of the HTML head — that bootstrap runs before any author script (including `react-dom`), which is required for the DevTools hook to be captured.

In production (`vite build`), the plugin is a no-op and no perfscope code is shipped.
