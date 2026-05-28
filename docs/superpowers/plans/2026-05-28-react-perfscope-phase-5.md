# react-perfscope Phase 5 — Build plugins, meta package, polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tool drop-in installable. Ship `@react-perfscope/vite` and `@react-perfscope/webpack` plugins that auto-inject the bootstrap in dev mode. Ship `react-perfscope` meta package whose `react-perfscope/auto` entry wires everything (recorder + render collector + UI mount) at import time. Plus three small polish items.

**Architecture:**
- **Meta package** (`react-perfscope`): pure re-exports from `@react-perfscope/{core,react,ui}` at `react-perfscope`, plus a side-effect `react-perfscope/auto` entry that runs the bootstrap.
- **Vite plugin** (`@react-perfscope/vite`): exports a default function returning a Vite plugin object. Uses `transformIndexHtml` to inject `<script type="module" src="/react-perfscope-auto">` in dev only. The plugin also serves a virtual module that maps to `react-perfscope/auto`.
- **Webpack plugin** (`@react-perfscope/webpack`): exports a class with `apply(compiler)`. Uses `EntryPlugin` to add `react-perfscope/auto` as an additional entry, dev mode only.

**Polish items:**
1. Hook load-order documentation in `@react-perfscope/react` README (the bug we fixed in Phase 4 needs visible explanation for consumers manually wiring the collector).
2. Overlay fade-out: `hideOverlay()` currently `.remove()`s the node immediately, killing the declared CSS transition. Either drop the transition or implement opacity-then-remove.
3. Widget a11y: `aria-pressed` and `aria-live` attributes.

**Tech Stack additions:**
- `vite ^5.0.0` as peerDep of the vite plugin (devDep for testing)
- `webpack ^5.90.0` as peerDep of the webpack plugin (devDep for testing)
- No other deps; tsup handles multi-entry for the meta package

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-5-plugins`.

---

## Task 1: Polish — hook load-order doc

**Goal:** Add a section in `@react-perfscope/react` README explaining the React DevTools hook load-order requirement: the hook must be installed BEFORE `react-dom` evaluates, otherwise React's `injectInternals()` captures `null` permanently and our collector never fires. Phase 4's `vi.hoisted` workaround needs a consumer-facing equivalent.

**Files:**
- Modify: `packages/react/README.md`

- [ ] **Step 1: Replace `packages/react/README.md`**

Use Write tool to overwrite the README with this content (the file's content begins immediately after this paragraph — copy what's between the `~~~markdown` fences, not the fences themselves):

~~~markdown
# @react-perfscope/react

React 18+ adapter for `react-perfscope`. Installs a DevTools global hook to observe commits, walks fiber trees, and exposes a render collector that plugs into `@react-perfscope/core`.

## Status

Phase 3-4 stable. Render collector emits one `RenderSignal` per changed component per commit; `RenderSignal.duration` populated from `fiber.actualDuration` when React is built with Profiling.

## Example

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

recorder.start()
// ... interact with the app ...
const result = recorder.stop()

console.log(result.signals.filter((s) => s.kind === 'render'))
```

## API

- `createRenderCollector()` — Collector factory. Emits `RenderSignal` per non-host fiber on each React commit.
- `resolveComponentFromElement(el)` — Given a DOM element, return the nearest React component name (or null if no fiber attached).
- `installDevToolsHook(listener)` — Low-level DevTools hook installer. Returns an unsubscribe function. Chains with any pre-existing hook (e.g. real React DevTools).
- `fiberComponentName(fiber)` — Resolve a fiber to its component name. Handles host tags, function/class components, `memo`, `forwardRef`.
- `walkChangedFibers(root, visit, { stopAt })` — Depth-first traversal of a fiber subtree with an upper bound.

## Hook load-order (IMPORTANT)

`react-dom` reads `globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__` ONCE at module evaluation time. If the hook isn't there at that moment, `react-dom`'s internal `injectedHook` is set to `null` and never updated — our collector will then never receive commits.

**Practical implication:** import `@react-perfscope/react` (or call `createRenderCollector()` / `installDevToolsHook()`) BEFORE you `import 'react-dom/client'` or before any module that does. The simplest pattern:

```ts
// At the very top of your entry file
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'

const recorder = createRecorder()
recorder.use(createRenderCollector())

// Now import React-DOM-touching code
import './app'
```

If you're using the `react-perfscope` meta package (or one of the build plugins), this ordering is handled automatically.

## Caveats

- The render collector keeps its DevTools hook listener attached across deactivate cycles (emission is gated by an `active` flag). This mirrors the `web-vitals` collector's lifecycle.
- `RenderSignal.duration` is `0` for fibers outside a Profiler-enabled root (React's default `createRoot` is Profiler-enabled in development).
~~~

- [ ] **Step 2: Tests still pass**

Run: `pnpm test`
Expected: 124/124.

- [ ] **Step 3: Commit**

```bash
git add packages/react/README.md
git commit -m "docs(react): document hook load-order requirement"
```

---

## Task 2: Polish — overlay fade-out transition

**Goal:** `hideOverlay()` calls `.remove()` immediately, so the declared `transition: opacity 80ms ease-out` is dead code. Implement true fade-out: set `opacity: 0`, schedule `.remove()` after the transition.

**Files:**
- Modify: `packages/ui/src/overlay.ts`
- Modify: `packages/ui/tests/overlay.test.tsx`

- [ ] **Step 1: Update the test for fade behavior**

Open `packages/ui/tests/overlay.test.tsx`. The existing test `hideOverlay removes only the named overlay` asserts the overlay is `null` immediately after `hideOverlay`. With the fade-out change, removal is deferred (after ~80ms). Replace that test with:

```ts
  it('hideOverlay starts a fade and removes the named overlay after the transition', async () => {
    showOverlay('a', new DOMRect(0, 0, 10, 10))
    showOverlay('b', new DOMRect(0, 0, 10, 10))
    hideOverlay('a')
    // Immediately after hide: a is still in DOM but opacity is 0
    const a = document.querySelector('[data-perfscope-overlay="a"]') as HTMLElement | null
    expect(a).toBeTruthy()
    expect(a!.style.opacity).toBe('0')
    expect(document.querySelector('[data-perfscope-overlay="b"]')).toBeTruthy()
    // After the transition window, a is removed
    await new Promise((r) => setTimeout(r, 120))
    expect(document.querySelector('[data-perfscope-overlay="a"]')).toBeNull()
    expect(document.querySelector('[data-perfscope-overlay="b"]')).toBeTruthy()
  })
```

Also update the existing `hideAllOverlays clears every overlay` test. With fade-out, immediate removal would no longer be observable — but `hideAllOverlays` is meant for synchronous cleanup (panel unmount), so it should remain immediate. Add a comment in the implementation. No test change needed for `hideAllOverlays`.

Update the existing panel-overlay integration test in `packages/ui/tests/panel.test.tsx`:

Find:
```ts
    fireEvent.mouseLeave(li)
    expect(document.querySelector('[data-perfscope-overlay]')).toBeNull()
```

Replace with:
```ts
    fireEvent.mouseLeave(li)
    // Immediately after mouseLeave: overlay is fading, still in DOM
    const fading = document.querySelector('[data-perfscope-overlay]') as HTMLElement | null
    expect(fading).toBeTruthy()
    expect(fading!.style.opacity).toBe('0')
```

(We drop the post-fade assertion in the panel test because it's exercised by the new overlay test.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/overlay.test.tsx packages/ui/tests/panel.test.tsx`
Expected: Two tests fail — the new fade-out test and the updated panel-overlay test (because hideOverlay still removes immediately).

- [ ] **Step 3: Implement fade in `overlay.ts`**

Replace `packages/ui/src/overlay.ts` contents with:

```ts
const OVERLAY_MARKER = 'data-perfscope-overlay'
const FADE_MS = 80

function getOrCreate(id: string): HTMLElement {
  const existing = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
  if (existing) return existing as HTMLElement
  const el = document.createElement('div')
  el.setAttribute(OVERLAY_MARKER, id)
  el.style.position = 'fixed'
  el.style.pointerEvents = 'none'
  el.style.boxSizing = 'border-box'
  el.style.border = '2px solid #ff3b30'
  el.style.background = 'rgba(255, 59, 48, 0.12)'
  el.style.zIndex = '2147483646'
  el.style.borderRadius = '2px'
  el.style.transition = `opacity ${FADE_MS}ms ease-out`
  document.body.appendChild(el)
  return el
}

export function showOverlay(id: string, rect: DOMRect): void {
  const el = getOrCreate(id)
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.style.opacity = '1'
}

/**
 * Trigger the fade-out transition and remove the overlay after it completes.
 * If the overlay is shown again before the fade timer fires, the timer is
 * cancelled and the element is kept.
 */
export function hideOverlay(id: string): void {
  const el = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`) as HTMLElement | null
  if (!el) return
  el.style.opacity = '0'
  setTimeout(() => {
    // Re-check existence in case the caller re-showed the overlay during the fade
    const stillThere = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
    if (stillThere && (stillThere as HTMLElement).style.opacity === '0') {
      stillThere.remove()
    }
  }, FADE_MS + 20)
}

/**
 * Remove every overlay immediately, skipping the fade. Used by Panel
 * unmount cleanup where we don't want lingering overlays.
 */
export function hideAllOverlays(): void {
  for (const el of Array.from(document.querySelectorAll(`[${OVERLAY_MARKER}]`))) {
    el.remove()
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/overlay.test.tsx packages/ui/tests/panel.test.tsx`
Expected: All pass.

- [ ] **Step 5: Full suite**

Run: `pnpm test && pnpm typecheck`
Expected: 124 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "fix(ui): overlay fade-out via opacity-then-remove on hideOverlay"
```

---

## Task 3: Polish — Widget a11y (aria-pressed + aria-live elapsed)

**Goal:** The toggle button should expose its on/off state to assistive tech via `aria-pressed`. The elapsed timer (which changes every animation frame) should be wrapped in an `aria-live="polite"` region so screen readers announce changes appropriately, but with a sane debounce-via-text-only strategy — we only re-announce when the displayed time changes (which happens roughly once per second due to `formatElapsed`).

**Files:**
- Modify: `packages/ui/src/widget.tsx`
- Modify: `packages/ui/tests/widget.test.tsx`

- [ ] **Step 1: Update widget tests**

Append to `packages/ui/tests/widget.test.tsx`:

```tsx
  it('sets aria-pressed=true when recording, false when idle', () => {
    const idle = render(<Widget recording={false} onToggle={() => {}} />)
    expect(idle.container.querySelector('button')?.getAttribute('aria-pressed')).toBe('false')
    cleanup()

    const rec = render(<Widget recording={true} elapsedMs={0} onToggle={() => {}} />)
    expect(rec.container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true')
    cleanup()
  })

  it('has an aria-live polite region for the elapsed counter', () => {
    const { container } = render(<Widget recording={true} elapsedMs={2000} onToggle={() => {}} />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toBeTruthy()
    expect(live?.textContent).toMatch(/0:02/)
    cleanup()
  })

  it('has an explicit aria-label on the toggle button', () => {
    const idleNode = render(<Widget recording={false} onToggle={() => {}} />)
    const idleBtn = idleNode.container.querySelector('button')
    expect(idleBtn?.getAttribute('aria-label')).toMatch(/start recording/i)
    cleanup()
    const recNode = render(<Widget recording={true} elapsedMs={0} onToggle={() => {}} />)
    const recBtn = recNode.container.querySelector('button')
    expect(recBtn?.getAttribute('aria-label')).toMatch(/stop recording/i)
    cleanup()
  })
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/widget.test.tsx`
Expected: 3 new tests fail (attributes missing).

- [ ] **Step 3: Update Widget**

In `packages/ui/src/widget.tsx`, find the `<button ...>` and replace it with:

```tsx
      <button
        type="button"
        aria-pressed={recording}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        onClick={onToggle}
        style={{
          background: '#1a1a1a',
          color: '#e6e6e6',
          border: '1px solid #2a2a2a',
          borderRadius: '20px',
          padding: '8px 14px',
          fontSize: '12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: recording ? '#ff3b30' : '#666',
            display: 'inline-block',
          }}
        />
        <span aria-live="polite">
          {recording ? formatElapsed(elapsedMs) : 'rec'}
        </span>
      </button>
```

Key changes:
- `aria-pressed={recording}` on the button (Preact will stringify `true`/`false` to attribute values `"true"`/`"false"`).
- `aria-label` reflects current action.
- Inner text wrapped in `<span aria-live="polite">` so the elapsed counter is the live region's content.

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/widget.test.tsx`
Expected: 7 tests pass (4 original + 3 new).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 127 tests pass (124 + 3), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): widget a11y (aria-pressed, aria-live elapsed, aria-label)"
```

---

## Task 4: Scaffold `react-perfscope` meta package

**Goal:** The meta package re-exports everything from `core`/`react`/`ui` at `react-perfscope`, and provides a side-effect `react-perfscope/auto` entry that bootstraps a recorder + render collector + UI mount at import time.

**Files:**
- Create: `packages/meta/package.json`
- Create: `packages/meta/tsconfig.json`
- Create: `packages/meta/tsup.config.ts`
- Create: `packages/meta/scripts/prepend-dts-refs.mjs`
- Create: `packages/meta/src/index.ts`
- Create: `packages/meta/src/auto.ts`

- [ ] **Step 1: Create `packages/meta/package.json`**

```json
{
  "name": "react-perfscope",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./auto": {
      "types": "./dist/auto.d.ts",
      "import": "./dist/auto.js",
      "require": "./dist/auto.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup && node scripts/prepend-dts-refs.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-perfscope/core": "workspace:*",
    "@react-perfscope/react": "workspace:*",
    "@react-perfscope/ui": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/meta/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

(No tests in the meta package — its surface is just re-exports + a small side-effect entry. The auto bootstrap is exercised end-to-end via the existing UI E2E test, and consumers verify by importing.)

- [ ] **Step 3: Create `packages/meta/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/auto.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@react-perfscope/core', '@react-perfscope/react', '@react-perfscope/ui'],
})
```

- [ ] **Step 4: Create `packages/meta/scripts/prepend-dts-refs.mjs`**

Same as other packages, but loops over BOTH entry d.ts files:

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const banner = '/// <reference lib="es2015" />\n/// <reference lib="dom" />\n\n'

for (const name of ['index.d.ts', 'index.d.cts', 'auto.d.ts', 'auto.d.cts']) {
  const file = join(distDir, name)
  if (!existsSync(file)) continue
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/// <reference')) continue
  writeFileSync(file, banner + content)
  console.log(`[postbuild] prepended lib refs to ${name}`)
}
```

- [ ] **Step 5: Create `packages/meta/src/index.ts`**

```ts
export * from '@react-perfscope/core'
export * from '@react-perfscope/react'
export * from '@react-perfscope/ui'
```

- [ ] **Step 6: Create `packages/meta/src/auto.ts`**

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

declare global {
  // eslint-disable-next-line no-var
  var __REACT_PERFSCOPE_AUTO_MOUNTED__: boolean | undefined
}

/**
 * Side-effect entry. Importing `react-perfscope/auto` bootstraps a Recorder
 * with the render collector and mounts the UI. Idempotent — importing twice
 * is a no-op (the first import wins).
 *
 * Bails when `process.env.NODE_ENV === 'production'` (build plugins also
 * guard against prod, but this is a defense-in-depth).
 */
function bootstrap(): void {
  if (typeof globalThis === 'undefined') return
  const g = globalThis as { __REACT_PERFSCOPE_AUTO_MOUNTED__?: boolean }
  if (g.__REACT_PERFSCOPE_AUTO_MOUNTED__) return

  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  if (env === 'production') return

  if (typeof document === 'undefined') return

  try {
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    mount({ recorder })
    g.__REACT_PERFSCOPE_AUTO_MOUNTED__ = true
  } catch (err) {
    console.warn('[react-perfscope] auto bootstrap failed:', err)
  }
}

bootstrap()
```

- [ ] **Step 7: Install + build**

Run: `pnpm install`

Run: `pnpm --filter react-perfscope build`
Expected: `packages/meta/dist/` contains `index.{js,cjs,d.ts,d.cts}` AND `auto.{js,cjs,d.ts,d.cts}`. Postbuild prepends lib refs to all 4 `.d.{ts,cts}` files.

- [ ] **Step 8: Verify exports**

Run: `head -3 packages/meta/dist/index.d.ts`
Expected: lib reference banner present.

Run: `head -3 packages/meta/dist/auto.d.ts`
Expected: lib reference banner present.

- [ ] **Step 9: Tests still pass**

Run: `pnpm test`
Expected: 127/127 (no new tests in this task; meta is exercised by Phase 6 example apps if added).

- [ ] **Step 10: Commit**

```bash
git add packages/meta pnpm-lock.yaml
git commit -m "feat(meta): scaffold react-perfscope meta package with /auto entry"
```

---

## Task 5: `@react-perfscope/vite` plugin

**Goal:** A Vite plugin that auto-injects `import 'react-perfscope/auto'` at the top of the user's HTML entry, but ONLY in dev mode (`vite serve`). The plugin uses `transformIndexHtml` to add a small `<script type="module">` that imports the meta package.

**Files:**
- Create: `packages/vite-plugin/package.json`
- Create: `packages/vite-plugin/tsconfig.json`
- Create: `packages/vite-plugin/tsup.config.ts`
- Create: `packages/vite-plugin/scripts/prepend-dts-refs.mjs`
- Create: `packages/vite-plugin/src/index.ts`
- Create: `packages/vite-plugin/tests/plugin.test.ts`

- [ ] **Step 1: Create `packages/vite-plugin/package.json`**

```json
{
  "name": "@react-perfscope/vite",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup && node scripts/prepend-dts-refs.mjs",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "vite": "^5.0.0 || ^6.0.0"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/vite-plugin/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/vite-plugin/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['vite'],
})
```

- [ ] **Step 4: Create `packages/vite-plugin/scripts/prepend-dts-refs.mjs`**

(Same shape as other packages.)

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const banner = '/// <reference lib="es2015" />\n/// <reference lib="dom" />\n\n'

for (const name of ['index.d.ts', 'index.d.cts']) {
  const file = join(distDir, name)
  if (!existsSync(file)) continue
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/// <reference')) continue
  writeFileSync(file, banner + content)
  console.log(`[postbuild] prepended lib refs to ${name}`)
}
```

- [ ] **Step 5: Write failing tests**

Create `packages/vite-plugin/tests/plugin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import reactPerfscope from '../src/index'

describe('reactPerfscope() vite plugin', () => {
  it('returns a Vite plugin object with the expected name', () => {
    const plugin = reactPerfscope()
    expect(plugin.name).toBe('react-perfscope')
  })

  it('applies only in dev (serve) mode', () => {
    const plugin = reactPerfscope()
    expect(plugin.apply).toBe('serve')
  })

  it('injects an auto-bootstrap script tag in transformIndexHtml', () => {
    const plugin = reactPerfscope()
    const result = (plugin.transformIndexHtml as { handler?: (html: string) => unknown }).handler
      ? (plugin.transformIndexHtml as { handler: (html: string) => unknown }).handler('<html><head></head><body></body></html>')
      : (plugin.transformIndexHtml as (html: string) => unknown)('<html><head></head><body></body></html>')
    // Result is { html?: string, tags?: HtmlTagDescriptor[] } per Vite API
    const tags = (result as { tags?: Array<{ tag: string; attrs?: Record<string, string> }> }).tags
    expect(tags).toBeTruthy()
    const hasScript = tags!.some(
      (t) => t.tag === 'script' && t.attrs?.['type'] === 'module' && /react-perfscope\/auto/.test(t.attrs?.['src'] ?? '')
    )
    expect(hasScript).toBe(true)
  })

  it('accepts options object (currently unused; reserves shape for Phase 6)', () => {
    expect(() => reactPerfscope({})).not.toThrow()
  })
})
```

- [ ] **Step 6: Run to verify fail**

Run: `pnpm test packages/vite-plugin/tests/plugin.test.ts`
Expected: Tests fail (module not found).

- [ ] **Step 7: Implement the plugin**

Create `packages/vite-plugin/src/index.ts`:

```ts
import type { Plugin, HtmlTagDescriptor } from 'vite'

export interface ReactPerfscopePluginOptions {
  // Reserved for Phase 6 (position, host, disabled, etc.).
}

/**
 * Vite plugin that auto-injects `react-perfscope/auto` into the HTML entry
 * during dev mode. The injected script imports the meta package which
 * bootstraps a recorder + render collector + UI mount.
 */
export default function reactPerfscope(_opts?: ReactPerfscopePluginOptions): Plugin {
  return {
    name: 'react-perfscope',
    apply: 'serve',
    transformIndexHtml(_html: string): { html?: string; tags: HtmlTagDescriptor[] } {
      return {
        tags: [
          {
            tag: 'script',
            attrs: {
              type: 'module',
              src: '/@id/react-perfscope/auto',
            },
            injectTo: 'head',
          },
        ],
      }
    },
  }
}
```

(The `/@id/react-perfscope/auto` URL is Vite's convention for resolving a bare module specifier via the dev server. Users with the meta package installed will get the auto-bootstrap loaded by their browser at startup.)

- [ ] **Step 8: Run tests**

Run: `pnpm test packages/vite-plugin/tests/plugin.test.ts`
Expected: 4/4 pass.

- [ ] **Step 9: Install + build**

Run: `pnpm install`
Expected: `vite` installed as devDep.

Run: `pnpm --filter @react-perfscope/vite build`
Expected: dist files produced with refs prepended.

- [ ] **Step 10: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 131 tests pass (127 + 4), typecheck clean across all packages.

- [ ] **Step 11: Commit**

```bash
git add packages/vite-plugin pnpm-lock.yaml
git commit -m "feat(vite): plugin that auto-injects react-perfscope/auto in dev"
```

---

## Task 6: `@react-perfscope/webpack` plugin

**Goal:** Webpack plugin class with `apply(compiler)` that, in development mode only, adds `react-perfscope/auto` as an additional entry point.

**Files:**
- Create: `packages/webpack-plugin/package.json`
- Create: `packages/webpack-plugin/tsconfig.json`
- Create: `packages/webpack-plugin/tsup.config.ts`
- Create: `packages/webpack-plugin/scripts/prepend-dts-refs.mjs`
- Create: `packages/webpack-plugin/src/index.ts`
- Create: `packages/webpack-plugin/tests/plugin.test.ts`

- [ ] **Step 1: Create `packages/webpack-plugin/package.json`**

```json
{
  "name": "@react-perfscope/webpack",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup && node scripts/prepend-dts-refs.mjs",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "webpack": "^5.90.0"
  },
  "devDependencies": {
    "webpack": "^5.95.0"
  }
}
```

- [ ] **Step 2: Create `packages/webpack-plugin/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/webpack-plugin/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['webpack'],
})
```

- [ ] **Step 4: Create `packages/webpack-plugin/scripts/prepend-dts-refs.mjs`**

(Same content as other packages — copy the standard 17-line script.)

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const banner = '/// <reference lib="es2015" />\n/// <reference lib="dom" />\n\n'

for (const name of ['index.d.ts', 'index.d.cts']) {
  const file = join(distDir, name)
  if (!existsSync(file)) continue
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/// <reference')) continue
  writeFileSync(file, banner + content)
  console.log(`[postbuild] prepended lib refs to ${name}`)
}
```

- [ ] **Step 5: Write failing tests**

Create `packages/webpack-plugin/tests/plugin.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ReactPerfscopePlugin } from '../src/index'

interface FakeCompiler {
  options: { mode?: 'production' | 'development' | 'none' }
  context: string
  webpack: { EntryPlugin: { new (context: string, entry: string, options: object): { apply: (c: FakeCompiler) => void } } }
}

function makeCompiler(mode: 'production' | 'development' | 'none' | undefined): FakeCompiler {
  const applies: Array<{ context: string; entry: string }> = []
  const FakeEntryPlugin = class {
    constructor(public context: string, public entry: string, public options: object) {}
    apply(c: FakeCompiler) {
      applies.push({ context: this.context, entry: this.entry })
      void c // unused
    }
  }
  const compiler: FakeCompiler = {
    options: { mode },
    context: '/fake/context',
    webpack: { EntryPlugin: FakeEntryPlugin as unknown as FakeCompiler['webpack']['EntryPlugin'] },
  }
  ;(compiler as { __applies?: typeof applies }).__applies = applies
  return compiler
}

function appliesOf(compiler: FakeCompiler): Array<{ context: string; entry: string }> {
  return (compiler as { __applies: Array<{ context: string; entry: string }> }).__applies
}

describe('ReactPerfscopePlugin (webpack)', () => {
  it('adds react-perfscope/auto as an entry in development mode', () => {
    const compiler = makeCompiler('development')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(1)
    expect(appliesOf(compiler)[0]!.entry).toBe('react-perfscope/auto')
  })

  it('is a no-op in production mode', () => {
    const compiler = makeCompiler('production')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(0)
  })

  it('is a no-op when mode is undefined (webpack defaults to production)', () => {
    const compiler = makeCompiler(undefined)
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(0)
  })

  it('accepts options object (reserved for Phase 6)', () => {
    expect(() => new ReactPerfscopePlugin({})).not.toThrow()
  })
})
```

- [ ] **Step 6: Run to verify fail**

Run: `pnpm test packages/webpack-plugin/tests/plugin.test.ts`
Expected: Tests fail (module not found).

- [ ] **Step 7: Implement the plugin**

Create `packages/webpack-plugin/src/index.ts`:

```ts
import type { Compiler } from 'webpack'

export interface ReactPerfscopePluginOptions {
  // Reserved for Phase 6.
}

/**
 * Webpack plugin that adds `react-perfscope/auto` as an additional entry in
 * development mode. The auto module bootstraps recorder + render collector
 * + UI mount at runtime.
 */
export class ReactPerfscopePlugin {
  constructor(_opts?: ReactPerfscopePluginOptions) {
    void _opts
  }

  apply(compiler: Compiler): void {
    if (compiler.options.mode !== 'development') return
    // Use compiler.webpack.EntryPlugin which is exposed on Compiler in webpack 5.
    const EntryPlugin = compiler.webpack.EntryPlugin
    new EntryPlugin(
      compiler.context,
      'react-perfscope/auto',
      { name: undefined } as never
    ).apply(compiler)
  }
}

export default ReactPerfscopePlugin
```

- [ ] **Step 8: Run tests**

Run: `pnpm test packages/webpack-plugin/tests/plugin.test.ts`
Expected: 4/4 pass.

- [ ] **Step 9: Install + build**

Run: `pnpm install`
Expected: `webpack` installed.

Run: `pnpm --filter @react-perfscope/webpack build`
Expected: dist files produced with refs prepended.

- [ ] **Step 10: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 135 tests pass (131 + 4), typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add packages/webpack-plugin pnpm-lock.yaml
git commit -m "feat(webpack): plugin that adds react-perfscope/auto entry in dev"
```

---

## Task 7: Final API + README + build verification across all packages

**Files:**
- Create: `packages/vite-plugin/README.md`
- Create: `packages/webpack-plugin/README.md`
- Create: `packages/meta/README.md`

- [ ] **Step 1: Create `packages/meta/README.md`**

Overwrite (or create) with this content:

~~~markdown
# react-perfscope

Performance debugging tool for React 18+ apps. Records forced reflows, layout shifts, long tasks, paint, web vitals, network, and React component renders during development.

This meta package re-exports everything from `@react-perfscope/core`, `@react-perfscope/react`, and `@react-perfscope/ui`, plus a side-effect `react-perfscope/auto` entry that bootstraps the full UI in one import.

## Quickstart

The simplest way to enable react-perfscope in a dev build:

```ts
// At the top of your entry file (e.g. src/main.tsx)
import 'react-perfscope/auto'

// ... your normal imports
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`react-perfscope/auto` must be imported BEFORE `react-dom` so the DevTools hook is installed before React captures it. Build plugins (`@react-perfscope/vite`, `@react-perfscope/webpack`) handle this ordering automatically.

## Manual API

If you want to control mounting yourself, import the named exports:

```ts
import { createRecorder, createRenderCollector, mount } from 'react-perfscope'

const recorder = createRecorder()
recorder.use(createRenderCollector())
const unmount = mount({ recorder, position: 'top-right' })
```

## Production safety

`react-perfscope/auto` bails when `process.env.NODE_ENV === 'production'`. The build plugins also exclude themselves from production builds. The manual API has no production guard — use it only behind your own dev/prod check.
~~~

- [ ] **Step 2: Create `packages/vite-plugin/README.md`**

~~~markdown
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
~~~

- [ ] **Step 3: Create `packages/webpack-plugin/README.md`**

~~~markdown
# @react-perfscope/webpack

Webpack plugin that adds `react-perfscope/auto` as an additional entry in development mode.

## Install

```sh
npm install -D @react-perfscope/webpack react-perfscope
```

## Usage

```js
// webpack.config.js
const { ReactPerfscopePlugin } = require('@react-perfscope/webpack')

module.exports = {
  mode: 'development',
  plugins: [
    new ReactPerfscopePlugin(),
  ],
}
```

The plugin checks `compiler.options.mode` and is a no-op when mode is anything other than `'development'`.
~~~

- [ ] **Step 4: Typecheck across all packages**

Run: `pnpm typecheck`
Expected: No errors anywhere.

- [ ] **Step 5: Build all packages**

Run: `pnpm -r --filter=./packages/* build`
Expected: All 6 packages (core, react, ui, meta, vite-plugin, webpack-plugin) produce dist/.

- [ ] **Step 6: Verify lib refs in all dist d.ts**

Run: `for f in packages/*/dist/index.d.ts packages/meta/dist/auto.d.ts; do echo "=== $f ==="; head -3 "$f"; done`
Expected: Every d.ts starts with `/// <reference lib="es2015" />` and `/// <reference lib="dom" />`.

- [ ] **Step 7: Full test run**

Run: `pnpm test`
Expected: 135/135 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/meta/README.md packages/vite-plugin/README.md packages/webpack-plugin/README.md
git commit -m "docs: README for meta, vite, webpack packages"
```

---

## Phase 5 Acceptance Criteria

After all 7 tasks complete:

- [ ] On branch `phase-5-plugins`
- [ ] `pnpm test` passes 100% (135 tests; +11 over Phase 4)
- [ ] `pnpm typecheck` clean across all 6 packages
- [ ] `pnpm -r --filter=./packages/* build` produces dist/ everywhere with lib refs
- [ ] `react-perfscope/auto` import bootstraps the full stack (recorder + render collector + UI mount), idempotent, prod-safe
- [ ] `@react-perfscope/vite` plugin produces a Vite plugin object with `apply: 'serve'` and injects the auto script
- [ ] `@react-perfscope/webpack` plugin adds `react-perfscope/auto` as an additional entry in dev mode only
- [ ] `@react-perfscope/react` README documents the hook load-order requirement
- [ ] Overlay fade-out actually plays (opacity-then-remove with timer)
- [ ] Widget has `aria-pressed`, `aria-label`, and an `aria-live` elapsed counter

## Next Phase Preview (Phase 6)

- Example apps: `examples/vite-react`, `examples/webpack-cra` — runnable demos showing the one-line install
- `@react-perfscope/react` integration test that drives real `react-dom` (not just a fake fiber) — the load-order regression class deserves its own test
- Paint/forced-reflow geometry: pair signals with MutationObserver records to compute rects and `cause`
- Bundle size budgets + CI checks
- Publishing flow (changeset, GitHub Actions release)
