# react-perfscope Phase 4 — @react-perfscope/ui + Profiler timings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@react-perfscope/ui` — a Preact-based floating widget mounted in a Shadow DOM. Provides a corner button to start/stop recording, a result panel with one tab per signal kind, and a DOM overlay highlighting elements referenced by signals. Replace `RenderSignal.duration = 0` with real React Profiler timings.

**Architecture:**
- New package `packages/ui/` written in **Preact** (not React) so the UI doesn't self-instrument when the host app's React commit collector observes commits.
- UI mounts into a Shadow DOM root attached to `document.body`, ensuring host-app CSS doesn't affect it and vice versa.
- The UI subscribes to a `Recorder` via `mount({ recorder })`. It manages its own local UI state (recording flag, expanded panel, hovered signal) using Preact's `useState`/`useReducer`.
- A separate **overlay layer** sits as a sibling fixed div (not in Shadow DOM, because we need to position relative to host-page elements). Reads element coordinates via `getBoundingClientRect()`.
- Render collector reads fiber `actualDuration` (React DevTools writes it via `--enable-profile` builds; in dev React, `_debugSource` is set but `actualDuration` only exists with Profiler-aware roots). For fibers without timing data, fall back to 0 with no warning (Phase 4 still graceful).

**Tech Stack additions:**
- `preact ^10.20.0` (UI runtime, ~3 KB)
- `@testing-library/react` already a devDep from Phase 3 (used here for E2E)
- No CSS framework — use inline styles and a `<style>` element inside the Shadow DOM for hover/transition.

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-4-ui` (created in repo before Task 1).

**Phase 4 layout summary:**

```
[Bottom-right corner]                    [Widget — recording state]
┌──────────┐                            ┌──────────┐
│  ● rec   │ ← click to stop            │  ● 0:12  │ ← time counter
└──────────┘                            └──────────┘

[After stop, panel expands]
┌──────────────────────────────────────┐
│ react-perfscope                  [×] │
├──────────────────────────────────────┤
│ [Reflow 12][CLS 3][LongTask 1][...]  │ ← tabs
├──────────────────────────────────────┤
│  ▸ forced-reflow @ 120.4ms           │
│    duration: 4.2ms                   │
│    component: <Header/>              │
│    src/Header.tsx:42:7               │
│  ▸ forced-reflow @ 124.1ms           │
│    ...                               │
└──────────────────────────────────────┘

[On hover, page overlay highlights]    ┌────────┐
                                        │ red box│
                                        │  on    │
                                        │ <h1/>  │
                                        └────────┘
```

---

## Task 1: Wire real Profiler timings into render-collector

**Goal:** Replace the hard-coded `duration: 0` in `render-collector.ts` with the fiber's `actualDuration` when available. React fibers carry timing data on Profiler-enabled roots; for plain roots `actualDuration` is `undefined` and we keep `0`.

**Files:**
- Modify: `packages/react/src/types.ts` (add `actualDuration?: number` to `MinimalFiber`)
- Modify: `packages/react/src/render-collector.ts`
- Modify: `packages/react/tests/render-collector.test.ts` (add test for `actualDuration` propagation)

- [ ] **Step 1: Add `actualDuration` to `MinimalFiber`**

In `packages/react/src/types.ts`, find the `MinimalFiber` interface:

```ts
export interface MinimalFiber {
  stateNode: unknown
  type: unknown
  return: MinimalFiber | null
  child: MinimalFiber | null
  sibling: MinimalFiber | null
  alternate: MinimalFiber | null
  elementType?: unknown
  memoizedProps?: unknown
}
```

Replace with (add `actualDuration?: number` field):

```ts
export interface MinimalFiber {
  stateNode: unknown
  type: unknown
  return: MinimalFiber | null
  child: MinimalFiber | null
  sibling: MinimalFiber | null
  alternate: MinimalFiber | null
  elementType?: unknown
  memoizedProps?: unknown
  /** Set by React when the fiber is inside a Profiler-enabled root. */
  actualDuration?: number
}
```

- [ ] **Step 2: Read `actualDuration` in render-collector**

In `packages/react/src/render-collector.ts`, find the `onCommit` function. Locate the `emit({ ... duration: 0 })` line and replace with:

```ts
const duration = typeof fiber.actualDuration === 'number' ? fiber.actualDuration : 0
emit({
  kind: 'render',
  at,
  component: name,
  reason: 'commit',
  duration,
})
```

- [ ] **Step 3: Add a test that the duration is read from the fiber**

In `packages/react/tests/render-collector.test.ts`, find the `describe('render collector', ...)` block and append before the closing `})`:

```ts
  it('uses fiber.actualDuration when available, otherwise 0', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      function Bar() { return null }
      const fooFiber = makeFiber(Foo, { actualDuration: 7.5 } as Partial<MinimalFiber>)
      const barFiber = makeFiber(Bar, { return: fooFiber } as Partial<MinimalFiber>)
      fooFiber.child = barFiber
      fireCommit(fooFiber)
      const renders = got as RenderSignal[]
      const foo = renders.find((s) => s.component === 'Foo')
      const bar = renders.find((s) => s.component === 'Bar')
      expect(foo?.duration).toBe(7.5)
      expect(bar?.duration).toBe(0)
    } finally {
      collector.deactivate()
    }
  })
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 93 tests pass (92 + 1), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src packages/react/tests
git commit -m "feat(react): read fiber.actualDuration for RenderSignal.duration"
```

---

## Task 2: Scaffold `@react-perfscope/ui` package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsup.config.ts`
- Create: `packages/ui/scripts/prepend-dts-refs.mjs`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@react-perfscope/ui",
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
  "dependencies": {
    "@react-perfscope/core": "workspace:*",
    "preact": "^10.20.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@testing-library/react": "^16.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/ui/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@react-perfscope/core', 'preact'],
})
```

- [ ] **Step 4: Create `packages/ui/scripts/prepend-dts-refs.mjs`**

(Same content as core/react versions.)

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

- [ ] **Step 5: Create `packages/ui/src/index.ts`**

```ts
export {}
```

- [ ] **Step 6: Update root `vitest.config.ts`**

Two changes:
1. Add `@react-perfscope/react` alias (Task 10 E2E test imports from it; without alias vitest would resolve to dist/).
2. Broaden the `include` glob so `.test.tsx` files match — UI tests use `.tsx`.

Replace `vitest.config.ts` contents with:

```ts
import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['packages/*/tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@react-perfscope/core': resolve(here, 'packages/core/src/index.ts'),
      '@react-perfscope/react': resolve(here, 'packages/react/src/index.ts'),
    },
  },
})
```

- [ ] **Step 7: Install + verify build**

Run from repo root: `pnpm install`
Expected: `preact` installed, workspace dep resolves.

Run: `pnpm --filter @react-perfscope/ui build`
Expected: dist files produced with refs prepended.

Run: `pnpm test`
Expected: 93 tests still pass (no UI tests yet).

- [ ] **Step 8: Commit**

```bash
git add packages/ui pnpm-lock.yaml vitest.config.ts
git commit -m "feat(ui): scaffold @react-perfscope/ui package (Preact + Shadow DOM target)"
```

---

## Task 3: Define UI types + `mount()` signature

**Files:**
- Create: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/types.ts`**

```ts
import type { Recorder } from '@react-perfscope/core'

export type WidgetPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'

export interface MountOptions {
  /** The recorder to control. The UI calls .start()/.stop() on it. */
  recorder: Recorder
  /** Corner placement of the floating widget. Defaults to 'bottom-right'. */
  position?: WidgetPosition
  /**
   * The host element under which the Shadow DOM root is created. Defaults
   * to document.body. Useful for testing or custom layouts.
   */
  host?: HTMLElement
}

export type UnmountFn = () => void
```

- [ ] **Step 2: Re-export from `packages/ui/src/index.ts`**

```ts
export * from './types'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @react-perfscope/ui typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): define MountOptions and WidgetPosition types"
```

---

## Task 4: Shadow DOM mount helper (TDD)

**Goal:** A helper that creates a `<div>` host element, attaches an open Shadow Root to it, and renders a Preact tree inside. Returns a teardown function that unmounts and removes the host element.

**Files:**
- Create: `packages/ui/tests/shadow-mount.test.ts`
- Create: `packages/ui/src/shadow-mount.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/tests/shadow-mount.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { h } from 'preact'
import { mountShadow } from '../src/shadow-mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) {
    cleanups.shift()!()
  }
  // Defensive: clear any leaked host elements
  for (const host of Array.from(document.querySelectorAll('[data-perfscope-host]'))) {
    host.remove()
  }
})

describe('mountShadow', () => {
  it('creates a host div with an open Shadow Root attached', () => {
    const teardown = mountShadow(h('span', null, 'hello'))
    cleanups.push(teardown)
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement | null
    expect(host).toBeTruthy()
    expect(host?.shadowRoot).toBeTruthy()
    expect(host?.shadowRoot?.mode).toBe('open')
  })

  it('renders the given Preact node inside the Shadow Root', () => {
    const teardown = mountShadow(h('div', { id: 'inner' }, 'hello'))
    cleanups.push(teardown)
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement
    const inner = host.shadowRoot!.querySelector('#inner')
    expect(inner?.textContent).toBe('hello')
  })

  it('teardown removes the host element from the document', () => {
    const teardown = mountShadow(h('span', null, 'goodbye'))
    teardown()
    expect(document.querySelector('[data-perfscope-host]')).toBeNull()
  })

  it('teardown is idempotent (second call is a no-op)', () => {
    const teardown = mountShadow(h('span', null, 'goodbye'))
    teardown()
    expect(() => teardown()).not.toThrow()
  })

  it('mounting twice creates two independent hosts', () => {
    cleanups.push(mountShadow(h('span', null, 'a')))
    cleanups.push(mountShadow(h('span', null, 'b')))
    const hosts = document.querySelectorAll('[data-perfscope-host]')
    expect(hosts).toHaveLength(2)
  })

  it('accepts a custom host element via opts.parent', () => {
    const parent = document.createElement('section')
    document.body.appendChild(parent)
    cleanups.push(mountShadow(h('span', null, 'x'), { parent }))
    expect(parent.querySelector('[data-perfscope-host]')).toBeTruthy()
    parent.remove()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/shadow-mount.test.ts`
Expected: 6 tests fail (module not found).

- [ ] **Step 3: Implement `shadow-mount.ts`**

Create `packages/ui/src/shadow-mount.ts`:

```ts
import { render, type ComponentChild } from 'preact'

const HOST_MARKER = 'data-perfscope-host'

export interface MountShadowOptions {
  /** Parent element under which the host div is appended. Defaults to document.body. */
  parent?: HTMLElement
}

export function mountShadow(vnode: ComponentChild, opts: MountShadowOptions = {}): () => void {
  const parent = opts.parent ?? document.body
  const host = document.createElement('div')
  host.setAttribute(HOST_MARKER, '')
  const root = host.attachShadow({ mode: 'open' })
  parent.appendChild(host)
  render(vnode, root as unknown as Element)

  let torn = false
  return () => {
    if (torn) return
    torn = true
    try {
      render(null, root as unknown as Element)
    } catch {
      // ignore
    }
    if (host.parentNode) host.parentNode.removeChild(host)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/shadow-mount.test.ts`
Expected: 6/6 pass.

- [ ] **Step 5: Re-export from index**

Update `packages/ui/src/index.ts`:

```ts
export * from './types'
export { mountShadow } from './shadow-mount'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 99 tests pass (93 + 6), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): Shadow DOM mount helper with idempotent teardown"
```

---

## Task 5: Floating widget component

**Goal:** A Preact component that renders the corner button. Two visual states: `idle` (gray dot) and `recording` (red dot + elapsed time). Click handler triggers a callback.

**Files:**
- Create: `packages/ui/tests/widget.test.tsx`
- Create: `packages/ui/src/widget.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/tests/widget.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { Widget } from '../src/widget'

describe('Widget', () => {
  it('renders the idle state by default', () => {
    const { container } = render(<Widget recording={false} onToggle={() => {}} />)
    expect(container.textContent).toContain('rec')
    cleanup()
  })

  it('renders the recording state with elapsed time', () => {
    const { container } = render(<Widget recording={true} elapsedMs={4321} onToggle={() => {}} />)
    expect(container.textContent).toMatch(/0:04/) // 4 seconds (floor)
    cleanup()
  })

  it('calls onToggle when the button is clicked', () => {
    const onToggle = vi.fn()
    const { container } = render(<Widget recording={false} onToggle={onToggle} />)
    const btn = container.querySelector('button')!
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledOnce()
    cleanup()
  })

  it('applies the position attribute', () => {
    const { container } = render(
      <Widget recording={false} onToggle={() => {}} position="top-left" />
    )
    const root = container.querySelector('[data-position]')
    expect(root?.getAttribute('data-position')).toBe('top-left')
    cleanup()
  })
})
```

Note: `@testing-library/preact` is needed. We'll add it in Step 3 alongside the implementation if not already present.

- [ ] **Step 2: Add `@testing-library/preact` devDep**

In `packages/ui/package.json`, add to `devDependencies`:

```json
"@testing-library/preact": "^3.2.4"
```

Then from repo root: `pnpm install`.

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test packages/ui/tests/widget.test.tsx`
Expected: 4 tests fail (module not found).

- [ ] **Step 4: Implement `widget.tsx`**

Create `packages/ui/src/widget.tsx`:

```tsx
import { h } from 'preact'
import type { WidgetPosition } from './types'

export interface WidgetProps {
  recording: boolean
  elapsedMs?: number
  onToggle: () => void
  position?: WidgetPosition
}

const POSITION_STYLES: Record<WidgetPosition, Record<string, string>> = {
  'bottom-right': { bottom: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'top-left': { top: '16px', left: '16px' },
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function Widget(props: WidgetProps) {
  const { recording, elapsedMs = 0, onToggle, position = 'bottom-right' } = props
  const positionStyle = POSITION_STYLES[position]

  return (
    <div
      data-position={position}
      style={{
        position: 'fixed',
        ...positionStyle,
        zIndex: '2147483647',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: recording ? '#1a1a1a' : '#1a1a1a',
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
        {recording ? formatElapsed(elapsedMs) : 'rec'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test packages/ui/tests/widget.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 103 tests pass (99 + 4), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): floating widget component with idle/recording states"
```

---

## Task 6: Recording orchestration component

**Goal:** A Preact `App` component that owns the recording state (idle/recording/results), drives the Widget, and shows the Panel after stop. Wires `recorder.start()` / `recorder.stop()`.

**Files:**
- Create: `packages/ui/tests/app.test.tsx`
- Create: `packages/ui/src/app.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/tests/app.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/preact'
import { createRecorder, type Recorder, type Signal } from '@react-perfscope/core'
import { App } from '../src/app'

describe('App', () => {
  it('starts in idle state with the widget visible and no panel', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    expect(container.querySelector('button')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /panel/i })).toBeNull()
    cleanup()
  })

  it('starts recording when the widget button is clicked', () => {
    const recorder = createRecorder()
    const startSpy = vi.spyOn(recorder, 'start')
    const { container } = render(<App recorder={recorder} />)
    fireEvent.click(container.querySelector('button')!)
    expect(startSpy).toHaveBeenCalledOnce()
    cleanup()
  })

  it('stops recording on second click and shows the panel', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(container.querySelectorAll('button')[0]!)
    expect(screen.queryByRole('region', { name: /panel/i })).toBeTruthy()
    cleanup()
  })

  it('closes the panel via the close button', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    // Start and stop
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(container.querySelectorAll('button')[0]!)
    // Click the close button (the second button in the panel header)
    const closeBtn = screen.getByLabelText(/close/i)
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: /panel/i })).toBeNull()
    cleanup()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/app.test.tsx`
Expected: 4 tests fail (module not found).

- [ ] **Step 3: Implement `app.tsx`**

Create `packages/ui/src/app.tsx`:

```tsx
import { h, type ComponentChildren } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { Recorder, RecordingResult } from '@react-perfscope/core'
import { Widget } from './widget'
import { Panel } from './panel'
import type { WidgetPosition } from './types'

export interface AppProps {
  recorder: Recorder
  position?: WidgetPosition
}

export function App(props: AppProps) {
  const { recorder, position = 'bottom-right' } = props
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!recording) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      setElapsedMs(performance.now() - startedAtRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [recording])

  function onToggle() {
    if (!recording) {
      startedAtRef.current = performance.now()
      setElapsedMs(0)
      setResult(null)
      recorder.start()
      setRecording(true)
    } else {
      const r = recorder.stop()
      setRecording(false)
      setResult(r)
    }
  }

  function onClose() {
    setResult(null)
  }

  return (
    <>
      {result === null && (
        <Widget
          recording={recording}
          elapsedMs={elapsedMs}
          onToggle={onToggle}
          position={position}
        />
      )}
      {result !== null && (
        <Panel result={result} position={position} onClose={onClose} />
      )}
    </>
  )
}
```

Note: `Panel` is implemented in Task 7. For Task 6's tests to compile, create a stub now in `packages/ui/src/panel.tsx`:

```tsx
import { h } from 'preact'
import type { RecordingResult } from '@react-perfscope/core'
import type { WidgetPosition } from './types'

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
}

export function Panel(props: PanelProps) {
  return (
    <div role="region" aria-label="react-perfscope panel">
      <button type="button" aria-label="Close panel" onClick={props.onClose}>×</button>
      <div>{props.result.signals.length} signals</div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/app.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 107 tests pass (103 + 4), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): App component orchestrates recording state + widget/panel"
```

---

## Task 7: Result panel with signal tabs

**Goal:** The full Panel component. Groups signals by `kind` into tabs; renders a list of signals per tab; each signal shows its key fields (time, duration, component, etc.).

**Files:**
- Create: `packages/ui/tests/panel.test.tsx`
- Modify: `packages/ui/src/panel.tsx` (replace stub)

- [ ] **Step 1: Write failing tests**

Create `packages/ui/tests/panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/preact'
import type { RecordingResult, Signal } from '@react-perfscope/core'
import { Panel } from '../src/panel'

function makeResult(signals: Signal[]): RecordingResult {
  return { signals, startedAt: 0, duration: 1000 }
}

describe('Panel', () => {
  it('renders a tab for each signal kind present in the result', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'long-task', at: 1, duration: 100, stack: [] },
      { kind: 'render', at: 2, component: 'Foo', reason: 'commit', duration: 0 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.getByText(/forced-reflow/i)).toBeTruthy()
    expect(screen.getByText(/long-task/i)).toBeTruthy()
    expect(screen.getByText(/render/i)).toBeTruthy()
    cleanup()
  })

  it('shows the count next to each tab label', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'forced-reflow', at: 1, duration: 2, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toMatch(/forced-reflow.*2/i)
    cleanup()
  })

  it('switches the visible signal list when a tab is clicked', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'render', at: 5, component: 'Foo', reason: 'commit', duration: 0 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    // Default tab shows first kind (forced-reflow). Click 'render' tab.
    fireEvent.click(screen.getByText(/render/i))
    expect(container.textContent).toContain('Foo')
    cleanup()
  })

  it('shows empty state when no signals were recorded', () => {
    const result = makeResult([])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.getByText(/no signals/i)).toBeTruthy()
    cleanup()
  })

  it('formats render signal with component name', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'Header', reason: 'commit', duration: 4.2 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toContain('Header')
    expect(container.textContent).toMatch(/4\.2/)
    cleanup()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const result = makeResult([])
    render(<Panel result={result} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalledOnce()
    cleanup()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 6 tests fail (Panel stub is too minimal).

- [ ] **Step 3: Implement the full Panel**

Replace `packages/ui/src/panel.tsx` contents with:

```tsx
import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { RecordingResult, Signal, SignalKind } from '@react-perfscope/core'
import type { WidgetPosition } from './types'

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
}

const KIND_ORDER: SignalKind[] = [
  'forced-reflow',
  'layout-shift',
  'long-task',
  'paint',
  'network',
  'web-vital',
  'render',
]

function groupByKind(signals: Signal[]): Record<SignalKind, Signal[]> {
  const acc = {
    'forced-reflow': [] as Signal[],
    'layout-shift': [] as Signal[],
    'long-task': [] as Signal[],
    'paint': [] as Signal[],
    'network': [] as Signal[],
    'web-vital': [] as Signal[],
    'render': [] as Signal[],
  } as Record<SignalKind, Signal[]>
  for (const s of signals) {
    acc[s.kind].push(s)
  }
  return acc
}

function renderSignal(s: Signal): string {
  switch (s.kind) {
    case 'forced-reflow':
      return `forced-reflow @ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(2)}ms`
    case 'layout-shift':
      return `layout-shift @ ${s.at.toFixed(1)}ms • value ${s.value.toFixed(3)} • ${s.sources.length} source(s)`
    case 'long-task':
      return `long-task @ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(1)}ms`
    case 'paint':
      return `paint @ ${s.at.toFixed(1)}ms • ${s.cause}`
    case 'network':
      return `${s.url} • ${s.duration.toFixed(0)}ms • ${(s.size / 1024).toFixed(1)}KB${s.blocking ? ' • blocking' : ''}`
    case 'web-vital':
      return `${s.name}: ${s.value.toFixed(2)}`
    case 'render':
      return `${s.component} • ${s.reason} • ${s.duration.toFixed(2)}ms`
  }
}

export function Panel(props: PanelProps) {
  const { result, onClose } = props
  const grouped = useMemo(() => groupByKind(result.signals), [result.signals])
  const kindsPresent = KIND_ORDER.filter((k) => grouped[k].length > 0)
  const [activeKind, setActiveKind] = useState<SignalKind | null>(
    kindsPresent[0] ?? null
  )

  const panelStyle = {
    position: 'fixed' as const,
    bottom: '16px',
    right: '16px',
    width: '420px',
    maxHeight: '60vh',
    background: '#0d0d0d',
    color: '#e6e6e6',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    zIndex: '2147483647',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  }

  return (
    <div role="region" aria-label="react-perfscope panel" style={panelStyle}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <strong>react-perfscope</strong>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#e6e6e6',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ×
        </button>
      </header>

      {kindsPresent.length === 0 && (
        <div style={{ color: '#888' }}>No signals recorded.</div>
      )}

      {kindsPresent.length > 0 && (
        <>
          <nav
            style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
              marginBottom: '8px',
            }}
          >
            {kindsPresent.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
                style={{
                  background: activeKind === kind ? '#2a2a2a' : '#1a1a1a',
                  color: '#e6e6e6',
                  border: '1px solid #2a2a2a',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {kind} {grouped[kind].length}
              </button>
            ))}
          </nav>

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              overflowY: 'auto',
              flexGrow: 1,
            }}
          >
            {activeKind &&
              grouped[activeKind].map((s, i) => (
                <li
                  key={i}
                  style={{
                    padding: '6px 8px',
                    borderTop: '1px solid #1a1a1a',
                    fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                    fontSize: '11px',
                  }}
                >
                  {renderSignal(s)}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 6/6 pass.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 113 tests pass (107 + 6), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): result panel with per-kind tabs and signal rendering"
```

---

## Task 8: Public `mount()` API

**Goal:** Tie it all together. `mount({ recorder, position?, host? })` creates the Shadow Root, renders the `<App>` inside it, returns an unmount function.

**Files:**
- Create: `packages/ui/tests/mount.test.tsx`
- Create: `packages/ui/src/mount.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/tests/mount.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { createRecorder } from '@react-perfscope/core'
import { mount } from '../src/mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.shift()!()
  for (const host of Array.from(document.querySelectorAll('[data-perfscope-host]'))) {
    host.remove()
  }
})

describe('mount', () => {
  it('inserts a Shadow Root host into document.body by default', () => {
    const recorder = createRecorder()
    cleanups.push(mount({ recorder }))
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement | null
    expect(host).toBeTruthy()
    expect(host?.parentElement).toBe(document.body)
    expect(host?.shadowRoot).toBeTruthy()
  })

  it('renders a widget button inside the Shadow Root', () => {
    const recorder = createRecorder()
    cleanups.push(mount({ recorder }))
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement
    const btn = host.shadowRoot!.querySelector('button')
    expect(btn).toBeTruthy()
  })

  it('returns an unmount function that removes the host', () => {
    const recorder = createRecorder()
    const unmount = mount({ recorder })
    unmount()
    expect(document.querySelector('[data-perfscope-host]')).toBeNull()
  })

  it('accepts a custom host element', () => {
    const recorder = createRecorder()
    const parent = document.createElement('section')
    document.body.appendChild(parent)
    cleanups.push(mount({ recorder, host: parent }))
    expect(parent.querySelector('[data-perfscope-host]')).toBeTruthy()
    parent.remove()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/mount.test.tsx`
Expected: 4 tests fail (module not found).

- [ ] **Step 3: Implement `mount.tsx`**

Create `packages/ui/src/mount.tsx`:

```tsx
import { h } from 'preact'
import { App } from './app'
import { mountShadow } from './shadow-mount'
import type { MountOptions, UnmountFn } from './types'

export function mount(opts: MountOptions): UnmountFn {
  const { recorder, position = 'bottom-right', host = document.body } = opts
  return mountShadow(<App recorder={recorder} position={position} />, { parent: host })
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/mount.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 5: Re-export from index**

Update `packages/ui/src/index.ts`:

```ts
export * from './types'
export { mountShadow } from './shadow-mount'
export { mount } from './mount'
export { Widget } from './widget'
export { Panel } from './panel'
export { App } from './app'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 117 tests pass (113 + 4), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): public mount() API tying recorder to Shadow DOM UI"
```

---

## Task 9: DOM overlay for highlighted signals

**Goal:** When the user hovers a signal in the panel that has an associated DOM element (e.g., `layout-shift.sources[0]`), draw a red box on the page over that element. Overlay lives in document.body (NOT in Shadow DOM, because we need to layer on top of host page).

For Phase 4, the only signal type with rect data is `layout-shift` (its `sources: DOMRect[]`). Other signals don't carry geometry until Phase 5. This task focuses on the infrastructure + layout-shift demo; future signals plug in identically.

**Files:**
- Create: `packages/ui/tests/overlay.test.tsx`
- Create: `packages/ui/src/overlay.ts`
- Modify: `packages/ui/src/panel.tsx` (wire hover handlers)

- [ ] **Step 1: Write failing tests for the overlay primitive**

Create `packages/ui/tests/overlay.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { showOverlay, hideOverlay, hideAllOverlays } from '../src/overlay'

afterEach(() => {
  hideAllOverlays()
})

describe('overlay primitive', () => {
  it('appends an absolutely-positioned overlay div to document.body', () => {
    showOverlay('test-1', new DOMRect(10, 20, 100, 50))
    const el = document.querySelector('[data-perfscope-overlay="test-1"]') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.style.position).toBe('fixed')
    expect(el.style.left).toBe('10px')
    expect(el.style.top).toBe('20px')
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('50px')
  })

  it('updates the same overlay on repeated show with the same id', () => {
    showOverlay('move', new DOMRect(0, 0, 10, 10))
    showOverlay('move', new DOMRect(100, 100, 200, 200))
    const els = document.querySelectorAll('[data-perfscope-overlay="move"]')
    expect(els).toHaveLength(1)
    expect((els[0] as HTMLElement).style.left).toBe('100px')
  })

  it('hideOverlay removes only the named overlay', () => {
    showOverlay('a', new DOMRect(0, 0, 10, 10))
    showOverlay('b', new DOMRect(0, 0, 10, 10))
    hideOverlay('a')
    expect(document.querySelector('[data-perfscope-overlay="a"]')).toBeNull()
    expect(document.querySelector('[data-perfscope-overlay="b"]')).toBeTruthy()
  })

  it('hideAllOverlays clears every overlay', () => {
    showOverlay('a', new DOMRect(0, 0, 10, 10))
    showOverlay('b', new DOMRect(0, 0, 10, 10))
    hideAllOverlays()
    expect(document.querySelectorAll('[data-perfscope-overlay]')).toHaveLength(0)
  })

  it('overlay is non-interactive (pointer-events: none)', () => {
    showOverlay('x', new DOMRect(0, 0, 10, 10))
    const el = document.querySelector('[data-perfscope-overlay="x"]') as HTMLElement
    expect(el.style.pointerEvents).toBe('none')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/overlay.test.tsx`
Expected: 5 tests fail (module not found).

- [ ] **Step 3: Implement `overlay.ts`**

Create `packages/ui/src/overlay.ts`:

```ts
const OVERLAY_MARKER = 'data-perfscope-overlay'

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
  el.style.transition = 'opacity 80ms ease-out'
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

export function hideOverlay(id: string): void {
  const el = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
  if (el) el.remove()
}

export function hideAllOverlays(): void {
  for (const el of Array.from(document.querySelectorAll(`[${OVERLAY_MARKER}]`))) {
    el.remove()
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/overlay.test.tsx`
Expected: 5/5 pass.

- [ ] **Step 5: Wire hover from Panel to overlay (for layout-shift signals only in Phase 4)**

Modify `packages/ui/src/panel.tsx`. Find the `<li>` rendering inside the signal list and replace with a version that triggers overlay on hover for layout-shift signals:

Locate this block:

```tsx
{activeKind &&
  grouped[activeKind].map((s, i) => (
    <li
      key={i}
      style={{
        padding: '6px 8px',
        borderTop: '1px solid #1a1a1a',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
      }}
    >
      {renderSignal(s)}
    </li>
  ))}
```

Replace with:

```tsx
{activeKind &&
  grouped[activeKind].map((s, i) => {
    const overlayId = `signal-${activeKind}-${i}`
    const hasGeometry = s.kind === 'layout-shift' && s.sources.length > 0
    return (
      <li
        key={i}
        onMouseEnter={() => {
          if (hasGeometry) {
            for (let j = 0; j < s.sources.length; j++) {
              showOverlay(`${overlayId}-${j}`, s.sources[j]!)
            }
          }
        }}
        onMouseLeave={() => {
          if (hasGeometry) {
            for (let j = 0; j < s.sources.length; j++) {
              hideOverlay(`${overlayId}-${j}`)
            }
          }
        }}
        style={{
          padding: '6px 8px',
          borderTop: '1px solid #1a1a1a',
          fontFamily: 'SF Mono, Menlo, Consolas, monospace',
          fontSize: '11px',
          cursor: hasGeometry ? 'pointer' : 'default',
        }}
      >
        {renderSignal(s)}
      </li>
    )
  })}
```

Then add the import at the top of `panel.tsx`:

```tsx
import { showOverlay, hideOverlay } from './overlay'
```

Also: when the panel unmounts (or closes), we want all overlays to disappear. Add a `useEffect` cleanup in the `Panel` component, right after the `useState` for `activeKind`:

```tsx
import { useEffect } from 'preact/hooks'
// ... inside Panel function, after useState:
useEffect(() => {
  return () => {
    hideAllOverlays()
  }
}, [])
```

And add `hideAllOverlays` to the import:

```tsx
import { showOverlay, hideOverlay, hideAllOverlays } from './overlay'
```

- [ ] **Step 6: Add a panel-overlay integration test**

Append to `packages/ui/tests/panel.test.tsx`:

```tsx
describe('Panel overlay integration', () => {
  it('shows overlay on layout-shift hover, hides on leave', () => {
    const rect = new DOMRect(10, 20, 100, 50)
    const result = makeResult([
      { kind: 'layout-shift', at: 0, value: 0.05, sources: [rect] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const li = container.querySelector('li')!
    fireEvent.mouseEnter(li)
    expect(document.querySelector('[data-perfscope-overlay]')).toBeTruthy()
    fireEvent.mouseLeave(li)
    expect(document.querySelector('[data-perfscope-overlay]')).toBeNull()
    cleanup()
  })
})
```

- [ ] **Step 7: Run tests**

Run: `pnpm test packages/ui/tests/`
Expected: All UI tests pass.

- [ ] **Step 8: Re-export overlay primitives from index**

Update `packages/ui/src/index.ts` to add overlay exports:

```ts
export * from './types'
export { mountShadow } from './shadow-mount'
export { mount } from './mount'
export { Widget } from './widget'
export { Panel } from './panel'
export { App } from './app'
export { showOverlay, hideOverlay, hideAllOverlays } from './overlay'
```

- [ ] **Step 9: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 123 tests pass (117 + 5 overlay + 1 panel integration), typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): DOM overlay for layout-shift sources on hover"
```

---

## Task 10: Real React end-to-end smoke test

**Goal:** Mount a real React 18 app, wire up `@react-perfscope/react` + `@react-perfscope/core` + `@react-perfscope/ui`, simulate a recording session, verify the panel shows captured signals.

**Files:**
- Create: `packages/ui/tests/e2e.test.tsx`

- [ ] **Step 1: Write the E2E test**

Create `packages/ui/tests/e2e.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector, uninstallDevToolsHook } from '@react-perfscope/react'
import { mount as mountPerfscope } from '../src/mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.shift()!()
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  document.body.innerHTML = ''
})

describe('end-to-end', () => {
  it('captures render signals from a real React tree and shows them in the panel', () => {
    // Set up the recorder + render collector
    const recorder = createRecorder()
    recorder.use(createRenderCollector())

    // Mount the perfscope UI
    const unmountUI = mountPerfscope({ recorder })
    cleanups.push(unmountUI)

    // Mount a real React app
    function Counter() {
      const [n, setN] = useState(0)
      return (
        <button type="button" onClick={() => setN(n + 1)} data-testid="counter">
          count: {n}
        </button>
      )
    }
    const appHost = document.createElement('div')
    document.body.appendChild(appHost)
    const root = createRoot(appHost)
    act(() => {
      root.render(<Counter />)
    })
    cleanups.push(() => {
      act(() => root.unmount())
      appHost.remove()
    })

    // Click the perfscope widget to start recording
    const perfscopeHost = document.querySelector('[data-perfscope-host]') as HTMLElement
    const widgetBtn = perfscopeHost.shadowRoot!.querySelector('button') as HTMLButtonElement
    widgetBtn.click()

    // Trigger a render in the real React tree
    const counterBtn = document.querySelector('[data-testid="counter"]') as HTMLButtonElement
    act(() => {
      counterBtn.click()
    })

    // Stop recording (click widget again)
    const widgetBtnAfter = perfscopeHost.shadowRoot!.querySelector('button') as HTMLButtonElement
    widgetBtnAfter.click()

    // Panel should now be open and contain at least one render signal
    const panel = perfscopeHost.shadowRoot!.querySelector('[role="region"]')
    expect(panel).toBeTruthy()
    expect(panel!.textContent).toContain('Counter')
  })
})
```

- [ ] **Step 2: Run the E2E test**

Run: `pnpm test packages/ui/tests/e2e.test.tsx`
Expected: 1 test passes.

If `act(...)` from `react` requires React 18.3.0+, make sure that's installed. (It is — Phase 3 added it as devDep.)

If the test is flaky because the perfscope UI re-renders during the recording window and the render collector picks up its own Preact mutations — that's actually fine; the test only checks for `Counter` in the panel text. The Preact components are also React-free, so no react render signals are emitted from them.

- [ ] **Step 3: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 124 tests pass (123 + 1), typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/tests
git commit -m "test(ui): end-to-end smoke with real React tree + render collector"
```

---

## Task 11: Final API + README + build verification

**Files:**
- Verify: `packages/ui/src/index.ts`
- Create: `packages/ui/README.md`

- [ ] **Step 1: Verify `packages/ui/src/index.ts`**

Open and confirm it reads exactly:

```ts
export * from './types'
export { mountShadow } from './shadow-mount'
export { mount } from './mount'
export { Widget } from './widget'
export { Panel } from './panel'
export { App } from './app'
export { showOverlay, hideOverlay, hideAllOverlays } from './overlay'
```

- [ ] **Step 2: Create `packages/ui/README.md`**

Use the Write tool to write `packages/ui/README.md` with the literal content between the `~~~markdown` fences below (do not include the `~~~` markers in the file):

~~~markdown
# @react-perfscope/ui

Floating-widget UI for `react-perfscope`. Mounts a Shadow-DOM-isolated Preact tree into your page. Records performance signals, shows them in a per-kind tabbed panel, and highlights affected DOM regions via overlay rectangles.

## Status

Phase 4 — initial implementation. Supports 7 signal kinds (forced-reflow, layout-shift, long-task, paint, network, web-vital, render). Overlay geometry implemented for `layout-shift.sources`; other kinds gain real geometry in Phase 5.

## Quickstart

```ts
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

const recorder = createRecorder()
recorder.use(createRenderCollector())

const unmount = mount({ recorder })
// ... later, to remove:
// unmount()
```

## API

- `mount({ recorder, position?, host? })` — returns an unmount function.
  - `position`: `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`. Defaults to `'bottom-right'`.
  - `host`: parent element to attach the Shadow DOM host. Defaults to `document.body`.
- `mountShadow(vnode, { parent? })` — low-level: mount any Preact vnode in a fresh Shadow Root. Returns unmount.
- `showOverlay(id, rect)` / `hideOverlay(id)` / `hideAllOverlays()` — DOM overlay primitives. Useful for custom UIs.
- `App`, `Panel`, `Widget` — Preact components, exported for advanced composition.

## Notes

- The UI is built in **Preact** (not React) so the render collector — which observes React commits — doesn't pick up our own widget renders.
- The Shadow Root uses `mode: 'open'` so tests and devtools can inspect the tree.
- The overlay lives outside the Shadow DOM (in `document.body`) so it can layer over arbitrary host-page elements.
~~~

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Build**

Run: `pnpm --filter @react-perfscope/ui build`
Expected: `packages/ui/dist/` contains `index.js`, `.cjs`, `.d.ts`, `.d.cts`, sourcemaps. Postbuild prepends lib refs.

- [ ] **Step 5: Inspect public surface**

Run: `head -3 packages/ui/dist/index.d.ts`
Expected: First two lines are the `/// <reference lib="es2015" />` and `/// <reference lib="dom" />` banners.

Run: `grep -E '^(export|declare)' packages/ui/dist/index.d.ts | head -25`
Expected: Exports include `mount`, `mountShadow`, `Widget`, `Panel`, `App`, `showOverlay`, `hideOverlay`, `hideAllOverlays`, plus types.

- [ ] **Step 6: Full test run**

Run: `pnpm test`
Expected: All 124 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/index.ts packages/ui/README.md
git commit -m "feat(ui): finalize Phase 4 exports + README"
```

---

## Phase 4 Acceptance Criteria

After all 11 tasks complete:

- [ ] On branch `phase-4-ui`
- [ ] `pnpm test` passes 100% (124 tests)
- [ ] `pnpm typecheck` clean across all 3 packages
- [ ] `pnpm --filter @react-perfscope/ui build` produces `dist/` with lib refs prepended
- [ ] `RenderSignal.duration` reads `fiber.actualDuration` when available (`0` fallback)
- [ ] `mount({ recorder })` renders a corner button; clicking starts/stops recording; stop opens the panel
- [ ] Panel groups signals by `kind`; each tab shows count + list with field summaries
- [ ] Hovering a layout-shift signal highlights its `sources[]` rects on the page
- [ ] E2E test exercises real React tree → renders captured in panel

## Next Phase Preview (Phase 5)

- Pair `PaintSignal.rect` and `cause` with real MutationObserver records (geometry + style/layout/unknown classification)
- Signal detail expansion (lazy stack frames + source-map resolved frames inline)
- DOM overlay support for non-layout-shift signals (use `resolveComponentFromElement` to find a host node and highlight it)
- Light/dark theme toggle, configurable z-index
- Build plugins (`@react-perfscope/vite`, `@react-perfscope/webpack`) for auto-inject
- Meta package `react-perfscope/auto` (dev-mode auto-bootstrap)
