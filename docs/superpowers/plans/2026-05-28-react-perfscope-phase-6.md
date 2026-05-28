# react-perfscope Phase 6 — Examples + ship-prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `react-perfscope` shippable to npm. Add a runnable Vite + React example app, declare `sideEffects` fields for tree-shaking, bump all packages to `0.1.0`, clean up the lingering `as never` cast in the webpack plugin, and write a root README that ties everything together.

**Scope decisions:**
- **Vite example only.** Webpack plugin gets API docs + CI smoke (tests already cover it) but no full demo app. Webpack example deferred to Phase 7 if needed.
- **No real-react-dom integration test in `@react-perfscope/react`** — deferred. The UI e2e test already drives a real React tree end-to-end and confirms the wiring.
- **No paint/forced-reflow geometry** — substantial work, own future phase.

**Architecture:**
- `examples/` directory added to `pnpm-workspace.yaml`. Examples are `"private": true` so they're never published.
- `examples/vite-react`: a minimal Vite + React 18 app with a Counter and a layout-shift trigger. Uses `workspace:*` references to all perfscope packages. README documents how to run.
- `sideEffects` fields prevent bundlers from tree-shaking `react-perfscope/auto` (which is side-effectful) while letting them shake the index re-exports.

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-6-shipprep`.

---

## Task 1: Webpack plugin — clean up `as never` cast

**Goal:** `packages/webpack-plugin/src/index.ts` passes `{ name: undefined } as never` to `EntryPlugin`. The cast hides a real type mismatch and looks alarming in published source. Replace with a typed value.

Webpack 5's `EntryOptions` type allows `{ name?: string }`. Passing `{ name: undefined }` is functionally equivalent to passing `{}` (or omitting the name entirely, which makes the entry a "global" additional entry). Use `{}` and a proper cast through `EntryOptions`.

**Files:**
- Modify: `packages/webpack-plugin/src/index.ts`

- [ ] **Step 1: Replace the `as never` cast**

In `packages/webpack-plugin/src/index.ts`, find:

```ts
    const EntryPlugin = compiler.webpack.EntryPlugin
    new EntryPlugin(
      compiler.context,
      'react-perfscope/auto',
      { name: undefined } as never
    ).apply(compiler)
```

Replace with:

```ts
    const EntryPlugin = compiler.webpack.EntryPlugin
    // EntryPlugin's options arg can be `string | EntryOptions`. Passing an
    // empty EntryOptions makes this an additional "global" entry (loaded
    // alongside the named entries). Webpack 5's typing accepts {} here.
    new EntryPlugin(
      compiler.context,
      'react-perfscope/auto',
      {} as Parameters<typeof EntryPlugin>[2]
    ).apply(compiler)
```

- [ ] **Step 2: Run tests**

Run: `pnpm test packages/webpack-plugin/tests/plugin.test.ts`
Expected: 4/4 pass (test mocks the EntryPlugin so the constructor args don't matter — but the cast change should be type-clean).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @react-perfscope/webpack typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/webpack-plugin/src/index.ts
git commit -m "refactor(webpack): replace 'as never' with properly typed EntryOptions"
```

---

## Task 2: Add `sideEffects` fields to meta and plugins

**Goal:** Tell bundlers which files are side-effectful so production tree-shaking can correctly include `react-perfscope/auto` (which mounts UI on import) while shaking unused exports from the regular `index` entry.

**Files:**
- Modify: `packages/meta/package.json`
- Modify: `packages/vite-plugin/package.json`
- Modify: `packages/webpack-plugin/package.json`

- [ ] **Step 1: Meta package — mark auto entry side-effectful**

In `packages/meta/package.json`, add a `"sideEffects"` field below `"files"`:

```json
  "files": ["dist"],
  "sideEffects": ["./dist/auto.js", "./dist/auto.cjs"],
  "scripts": {
```

This tells bundlers:
- `./dist/auto.js` and `.cjs` MUST be included even if no symbols are referenced (the file has side effects — it mounts UI).
- All other files (including `./dist/index.*`) are pure — bundlers can tree-shake unused named imports.

- [ ] **Step 2: Vite plugin — mark side-effect-free**

In `packages/vite-plugin/package.json`, add:

```json
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
```

The Vite plugin is a pure factory + class with no side effects on import.

- [ ] **Step 3: Webpack plugin — mark side-effect-free**

Same in `packages/webpack-plugin/package.json`:

```json
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
```

- [ ] **Step 4: Tests still pass**

Run: `pnpm test`
Expected: 135/135.

- [ ] **Step 5: Commit**

```bash
git add packages/meta/package.json packages/vite-plugin/package.json packages/webpack-plugin/package.json
git commit -m "chore: declare sideEffects fields for proper tree-shaking"
```

---

## Task 3: Bump all packages to version 0.1.0

**Goal:** First publishable version. Bump `0.0.0` → `0.1.0` everywhere. Workspace references (`workspace:*`) automatically resolve to the new version.

**Files:**
- Modify all 6 `package.json`: `packages/{core,react,ui,meta,vite-plugin,webpack-plugin}/package.json`

- [ ] **Step 1: Bump each package**

For each of the 6 package.json files, change:

```json
  "version": "0.0.0",
```

To:

```json
  "version": "0.1.0",
```

Paths:
- `packages/core/package.json`
- `packages/react/package.json`
- `packages/ui/package.json`
- `packages/meta/package.json`
- `packages/vite-plugin/package.json`
- `packages/webpack-plugin/package.json`

- [ ] **Step 2: Reinstall to update lockfile**

Run: `pnpm install`
Expected: pnpm-lock.yaml reflects the new versions (no actual install of new packages — just workspace version metadata).

- [ ] **Step 3: Full suite + typecheck + build**

Run: `pnpm test && pnpm typecheck && pnpm -r --filter=./packages/* build`
Expected: 135 tests pass, typecheck clean, all 6 packages build successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/*/package.json pnpm-lock.yaml
git commit -m "chore: bump all packages to 0.1.0"
```

---

## Task 4: Add `examples/*` to the pnpm workspace

**Goal:** The Vite example (Task 5) needs to live in the workspace so its `workspace:*` deps resolve. We add `examples/*` to `pnpm-workspace.yaml` and ensure typecheck/test pipelines don't try to process examples.

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root) — adjust `test`, `typecheck`, `build` scripts to filter `./packages/*` only

- [ ] **Step 1: Update `pnpm-workspace.yaml`**

Replace `pnpm-workspace.yaml` contents with:

```yaml
packages:
  - "packages/*"
  - "examples/*"
```

- [ ] **Step 2: Inspect root `package.json` scripts**

Open `package.json` (root). Verify the scripts are already filtered to `./packages/*`:

```json
"scripts": {
  "build": "pnpm -r --filter=./packages/* build",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "pnpm -r --filter=./packages/* typecheck"
}
```

If they don't already filter to `./packages/*`, fix them. (They should already from Phase 1.)

`vitest`'s `include` glob (`packages/*/tests/**/*.test.{ts,tsx}`) already excludes examples — no change needed there.

- [ ] **Step 3: Create empty examples directory placeholder**

Create `examples/.gitkeep` (empty file) so the directory exists in git before Task 5 fills it.

Run: `mkdir -p examples && touch examples/.gitkeep`

- [ ] **Step 4: Run pnpm install + verify**

Run: `pnpm install`
Expected: No errors. `pnpm -r --filter=./packages/* build` still works (filters to packages only).

Run: `pnpm test`
Expected: 135 tests pass (examples not included by glob).

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml examples/.gitkeep
git commit -m "chore: register examples/* in pnpm workspace"
```

---

## Task 5: Build the `examples/vite-react` demo app

**Goal:** A minimal but real Vite + React 18 app that uses `@react-perfscope/vite`. Includes a Counter (renders) and a layout-shift trigger button (visible CLS overlay). README explains how to run.

**Files:**
- Create: `examples/vite-react/package.json`
- Create: `examples/vite-react/vite.config.ts`
- Create: `examples/vite-react/tsconfig.json`
- Create: `examples/vite-react/index.html`
- Create: `examples/vite-react/src/main.tsx`
- Create: `examples/vite-react/src/App.tsx`
- Create: `examples/vite-react/README.md`

- [ ] **Step 1: Create `examples/vite-react/package.json`**

```json
{
  "name": "@react-perfscope-example/vite-react",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-perfscope": "workspace:*"
  },
  "devDependencies": {
    "@react-perfscope/vite": "workspace:*",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `examples/vite-react/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [reactPerfscope(), react()],
})
```

- [ ] **Step 3: Create `examples/vite-react/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

(Standalone — does NOT extend the monorepo base, because examples should look like a normal user setup.)

- [ ] **Step 4: Create `examples/vite-react/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>react-perfscope demo (Vite + React)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `examples/vite-react/src/main.tsx`**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

(Note: NO manual `import 'react-perfscope/auto'`. The Vite plugin injects it into the HTML head with proper ordering.)

- [ ] **Step 6: Create `examples/vite-react/src/App.tsx`**

```tsx
import React, { useState } from 'react'

const containerStyle: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: '640px',
  margin: '64px auto',
  padding: '24px',
  lineHeight: 1.5,
  color: '#222',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e6e6e6',
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '16px',
  background: '#fafafa',
}

const buttonStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#fff',
  border: 0,
  borderRadius: '6px',
  padding: '8px 14px',
  cursor: 'pointer',
  marginRight: '8px',
}

function Counter() {
  const [n, setN] = useState(0)
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>Counter</h2>
      <p>Each click re-renders this component. The render collector captures each commit.</p>
      <button type="button" style={buttonStyle} onClick={() => setN(n + 1)}>
        count: {n}
      </button>
    </div>
  )
}

function LayoutShifter() {
  const [tall, setTall] = useState(false)
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>Layout shifter</h2>
      <p>
        Click to insert a tall block above the following text — produces a layout-shift signal.
        Hover the signal in the perfscope panel to see the source region highlighted.
      </p>
      <button type="button" style={buttonStyle} onClick={() => setTall((v) => !v)}>
        {tall ? 'Remove tall block' : 'Insert tall block'}
      </button>
      {tall && (
        <div
          style={{
            background: '#cbd5e1',
            height: '120px',
            marginTop: '16px',
            borderRadius: '6px',
          }}
        />
      )}
      <p style={{ marginTop: '16px' }}>This paragraph moves when the tall block is inserted.</p>
    </div>
  )
}

export function App() {
  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: '8px' }}>react-perfscope demo</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Click the floating widget in the bottom-right to start recording. Interact below, then click again to stop.
      </p>
      <Counter />
      <LayoutShifter />
    </div>
  )
}
```

- [ ] **Step 7: Create `examples/vite-react/README.md`**

~~~markdown
# react-perfscope demo — Vite + React 18

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
~~~

- [ ] **Step 8: Install workspace deps**

Run: `pnpm install`
Expected: `examples/vite-react/node_modules` symlinks to workspace packages. No new external installs except `@vitejs/plugin-react` and friends.

- [ ] **Step 9: Verify the example builds in production mode**

Run: `pnpm --filter @react-perfscope-example/vite-react build`
Expected: `vite build` succeeds. `dist/` contains an HTML + JS bundle. The bundle should NOT contain `react-perfscope/auto` import (the plugin is no-op in build).

Verify the production bundle didn't pull in perfscope:

```bash
grep -r 'react-perfscope' examples/vite-react/dist/
```

Expected: 0 matches (perfscope is excluded from prod).

- [ ] **Step 10: Smoke check that dev mode injects the bootstrap**

Run: `pnpm --filter @react-perfscope-example/vite-react dev` and wait for the server to start. Open `http://localhost:5173/` in a browser. Confirm the floating widget appears. Stop the dev server (Ctrl-C).

If you can't run an interactive dev server in the agent environment, skip this step and report it in the self-review (the production build verification + plugin unit tests cover the main path).

- [ ] **Step 11: Run full suite (root)**

Run: `pnpm test && pnpm typecheck`
Expected: 135 tests pass (examples are not included in test glob). Typecheck only runs packages/*, not examples/*.

- [ ] **Step 12: Commit**

```bash
git add examples/vite-react pnpm-lock.yaml
git commit -m "feat(examples): vite-react demo with Counter + layout-shift trigger"
```

---

## Task 6: Root README rewrite

**Goal:** The repo root has a minimal README from Phase 1. Replace with a real one that ties together the architecture, packages, quickstart, and demo.

**Files:**
- Modify: `README.md` (root)

- [ ] **Step 1: Replace root `README.md`**

Use Write tool to overwrite `README.md` with the literal content between the `~~~markdown` markers (do not include the markers):

~~~markdown
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
pnpm -r --filter=./packages/* build   # tsup per package
```

## License

MIT.
~~~

- [ ] **Step 2: Tests still pass**

Run: `pnpm test`
Expected: 135/135.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: root README tying packages, quickstart, and demo"
```

---

## Task 7: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Full test run**

Run: `pnpm test`
Expected: 135/135 tests pass.

- [ ] **Step 2: Typecheck across all packages**

Run: `pnpm typecheck`
Expected: No errors in any of the 6 packages.

- [ ] **Step 3: Build all packages**

Run: `pnpm -r --filter=./packages/* build`
Expected: 6 successful builds. All `dist/index.d.ts` files (and `dist/auto.d.ts` for the meta package) start with the `/// <reference lib="es2015" />` banner.

- [ ] **Step 4: Verify lib refs across all dist d.ts files**

Run:
```sh
for f in packages/core/dist/index.d.ts packages/react/dist/index.d.ts packages/ui/dist/index.d.ts packages/meta/dist/index.d.ts packages/meta/dist/auto.d.ts packages/vite-plugin/dist/index.d.ts packages/webpack-plugin/dist/index.d.ts; do
  echo "=== $f ==="
  head -3 "$f"
done
```

Expected: Every d.ts starts with both lib references.

- [ ] **Step 5: Verify version bump landed in all packages**

Run: `grep '"version"' packages/*/package.json`
Expected: every package shows `"version": "0.1.0"`.

- [ ] **Step 6: Verify sideEffects field in meta + plugins**

Run: `grep -A1 sideEffects packages/{meta,vite-plugin,webpack-plugin}/package.json`
Expected: meta shows `["./dist/auto.js", "./dist/auto.cjs"]`; vite-plugin and webpack-plugin show `false`.

- [ ] **Step 7: Verify example builds**

Run: `pnpm --filter @react-perfscope-example/vite-react build`
Expected: Vite build succeeds. `examples/vite-react/dist/` populated. No `react-perfscope` references in the production bundle.

- [ ] **Step 8: Verify webpack plugin no longer has `as never`**

Run: `grep 'as never' packages/webpack-plugin/src/index.ts`
Expected: 0 matches.

- [ ] **Step 9: No additional commit**

This task is verification only. If any step fails, the failing earlier task needs fixing.

---

## Phase 6 Acceptance Criteria

After all 7 tasks complete:

- [ ] On branch `phase-6-shipprep`
- [ ] `pnpm test` passes 100% (still 135 tests; no new ones in Phase 6)
- [ ] `pnpm typecheck` clean across all 6 packages
- [ ] `pnpm -r --filter=./packages/* build` produces dist/ for all 6 packages
- [ ] All 6 packages at `0.1.0`
- [ ] `sideEffects` declared correctly for meta + vite + webpack
- [ ] `examples/vite-react` builds cleanly; production bundle excludes perfscope
- [ ] Root README documents quickstart, packages, demo, and status
- [ ] No `as never` cast in webpack plugin

## Next Phase Preview (Phase 7)

- `examples/webpack-cra` (or `examples/webpack`) — second example for the webpack plugin
- Real react-dom integration test in `@react-perfscope/react`
- Paint / forced-reflow geometry: pair signals with MutationObserver records
- Bundle size budgets + CI checks (size-limit / @size-limit/preset-small-lib)
- GitHub Actions workflow: test + typecheck + build on PR
- changeset-based release automation
- npm publish dry-run (`pnpm publish --dry-run` smoke test)
