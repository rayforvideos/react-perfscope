# react-perfscope Phase 3 — @react-perfscope/react

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@react-perfscope/react` — the React 18+ adapter package. It installs a hook on React's DevTools global to observe commits, walks fiber trees to attribute changes to component names, and exposes a `createRenderCollector()` factory that emits `RenderSignal`s into the `@react-perfscope/core` Recorder.

**Architecture:** A new package under `packages/react/`. Single-responsibility modules: `fiber-walker.ts` (low-level fiber traversal + commit hook installation), `attribution.ts` (DOM element → fiber → component name), `render-collector.ts` (Collector factory). Tests run under happy-dom with React 18 mounted via `react-dom/client`.

**Tech Stack:** Adds `react ^18.3.0` and `react-dom ^18.3.0` as peerDependencies; uses `@react-perfscope/core` workspace dep. Tests use `@testing-library/react` for ergonomic mount + cleanup.

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-3-react-adapter` (already created in repo before Task 1).

**Phase 2 → Phase 3 also includes 2 cleanup tasks:**
1. Fix `web-vitals` re-subscription across start/stop cycles.
2. Remove `FID` from `WebVitalSignal['name']` union (web-vitals v4 dropped it).

---

## Task 1: Drop `FID` from `WebVitalSignal['name']` union

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/collectors/web-vitals.ts` (no functional change — already doesn't subscribe to FID — but verify no `'FID'` literal lingering)

- [ ] **Step 1: Update the type union**

In `packages/core/src/types.ts`, find:
```ts
export type WebVitalSignal = {
  kind: 'web-vital'
  name: 'LCP' | 'FID' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
  value: number
}
```

Replace with:
```ts
export type WebVitalSignal = {
  kind: 'web-vital'
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
  value: number
}
```

- [ ] **Step 2: Verify no `'FID'` literal exists in `web-vitals.ts`**

Run: `grep -n "'FID'" packages/core/src/collectors/web-vitals.ts`
Expected: no matches (current code only subscribes to LCP/INP/CLS/FCP/TTFB).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @react-perfscope/core typecheck`
Expected: No errors.

- [ ] **Step 4: Tests**

Run: `pnpm test`
Expected: 62/62 still pass (no behavior change, just narrower type).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "refactor(core): drop FID from WebVitalSignal name union (web-vitals v4)"
```

---

## Task 2: Fix `web-vitals` re-subscription across start/stop cycles

**Goal:** Currently `createWebVitalsCollector()` calls `onLCP/onINP/...` every time `activate()` runs. After deactivate → reactivate, the previous handlers stay registered with the `web-vitals` library, so the next emit fires through OLD handlers (with stale `emit` closure) AND new ones. Fix: subscribe ONCE per collector instance; subsequent activates only swap the `emit` reference.

**Files:**
- Modify: `packages/core/src/collectors/web-vitals.ts`
- Modify: `packages/core/tests/collectors/web-vitals.test.ts` (add a test that re-activating doesn't double-subscribe)

- [ ] **Step 1: Add failing test for re-subscription**

Append to `packages/core/tests/collectors/web-vitals.test.ts` (inside the existing `describe('web-vitals collector', ...)` block, before the closing `})`):

```ts
  it('does not re-subscribe across deactivate → activate cycles', () => {
    let lcpSubscriptionCount = 0
    // Override the subscriber for this test to count calls
    const originalOnLCP = subscribers.LCP
    const collector = createWebVitalsCollector()

    // First activation registers subscribers
    collector.activate(() => {})
    expect(subscribers.LCP).toBeDefined()
    lcpSubscriptionCount++

    // Second activation should NOT re-register (no new onLCP call)
    collector.deactivate()
    const lcpBefore = subscribers.LCP
    collector.activate(() => {})
    const lcpAfter = subscribers.LCP
    expect(lcpAfter).toBe(lcpBefore) // same handler reference (no new subscription)

    // Cleanup
    subscribers.LCP = originalOnLCP
  })

  it('routes signals to the most recent emit after re-activate', () => {
    const collector = createWebVitalsCollector()
    const firstReceived: Signal[] = []
    const secondReceived: Signal[] = []

    collector.activate((s) => firstReceived.push(s))
    collector.deactivate()
    collector.activate((s) => secondReceived.push(s))

    subscribers.LCP!({ name: 'LCP', value: 1234 })
    expect(firstReceived).toHaveLength(0)
    expect(secondReceived).toHaveLength(1)
  })
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/core/tests/collectors/web-vitals.test.ts`
Expected:
- First new test (`does not re-subscribe`) FAILS: `lcpAfter` is NOT same as `lcpBefore` because current code calls `onLCP(makeHandler('LCP'))` again on second activate, replacing `subscribers.LCP` in the mock.
- Second new test (`routes to most recent emit`): the OLD emit may have been overwritten by `emit = emitFn` so this might pass — but only by accident. The fix should make both reliably pass.

- [ ] **Step 3: Implement the fix**

Replace the entire contents of `packages/core/src/collectors/web-vitals.ts` with:

```ts
import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'
import type { Collector, Signal, WebVitalSignal } from '../types'

type VitalName = WebVitalSignal['name']

export function createWebVitalsCollector(): Collector {
  let active = false
  let subscribed = false
  let emit: (signal: Signal) => void = () => {}

  function makeHandler(name: VitalName) {
    return (metric: Metric) => {
      if (!active) return
      emit({ kind: 'web-vital', name, value: metric.value })
    }
  }

  return {
    kind: 'web-vital',
    activate(emitFn) {
      emit = emitFn
      active = true
      if (subscribed) return
      try {
        onLCP(makeHandler('LCP'))
        onINP(makeHandler('INP'))
        onCLS(makeHandler('CLS'))
        onFCP(makeHandler('FCP'))
        onTTFB(makeHandler('TTFB'))
        subscribed = true
      } catch (err) {
        console.warn('[react-perfscope] web-vitals collector failed to subscribe:', err)
        active = false
      }
    },
    deactivate() {
      // The web-vitals library does not expose unsubscribe. We keep the
      // handlers attached and gate emission via `active`. Re-activating
      // updates `emit` without re-subscribing.
      active = false
    },
  }
}
```

Key changes:
- New `subscribed` flag, set to true after first successful subscription.
- `activate` now updates `emit` and `active` *first*, then bails if `subscribed` is true.
- This means re-activating updates the closure-captured `emit` (which the existing handlers use) without registering new handlers.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/collectors/web-vitals.test.ts`
Expected: 5/5 pass (3 original + 2 new).

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 64 tests pass (62 + 2), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/collectors/web-vitals.ts packages/core/tests/collectors/web-vitals.test.ts
git commit -m "fix(core): web-vitals collector subscribes once across start/stop cycles"
```

---

## Task 3: Scaffold `@react-perfscope/react` package

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsup.config.ts`
- Create: `packages/react/scripts/prepend-dts-refs.mjs` (mirrors core's postbuild)
- Create: `packages/react/src/index.ts`

- [ ] **Step 1: Create `packages/react/package.json`**

```json
{
  "name": "@react-perfscope/react",
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
    "@react-perfscope/core": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@testing-library/react": "^16.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/react/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/react/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', '@react-perfscope/core'],
})
```

- [ ] **Step 4: Create `packages/react/scripts/prepend-dts-refs.mjs`**

(Same content as in core; lib refs ensure ES5 consumers don't hit TS2705.)

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

- [ ] **Step 5: Create `packages/react/src/index.ts`**

```ts
export {}
```

(Placeholder — Task 4+ fills it in.)

- [ ] **Step 6: Update root `vitest.config.ts` to alias `@react-perfscope/core` to its source**

Without this, vitest resolves `import { ... } from '@react-perfscope/core'` (used by react tests in later tasks) via the package's `exports` field, which points to `dist/`. Tests would then run against a stale build (or fail if not built). Aliasing to the source TS file makes tests fast and always-current.

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
    include: ['packages/*/tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@react-perfscope/core': resolve(here, 'packages/core/src/index.ts'),
    },
  },
})
```

- [ ] **Step 7: Install dependencies + verify build**

Run from repo root: `pnpm install`
Expected: workspace dep `@react-perfscope/core` resolves, React + testing-library installed.

Run: `pnpm --filter @react-perfscope/react build`
Expected: `packages/react/dist/index.js`, `.cjs`, `.d.ts` produced. Refs prepended to d.ts/d.cts.

Run: `pnpm test`
Expected: 64 tests pass (still core only — packages/react has no tests yet).

- [ ] **Step 8: Commit**

```bash
git add packages/react pnpm-lock.yaml vitest.config.ts
git commit -m "feat(react): scaffold @react-perfscope/react package"
```

---

## Task 4: Define React adapter types

**Files:**
- Create: `packages/react/src/types.ts`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Create `packages/react/src/types.ts`**

```ts
import type { Collector } from '@react-perfscope/core'

/**
 * Resolves a DOM element back to the nearest React component name in the
 * fiber tree. Returns null when no React fiber is attached (e.g. host nodes
 * outside any React root, detached nodes, or before React mounts).
 */
export interface ReactAdapter {
  /**
   * Install the DevTools global hook to observe React commits. Idempotent:
   * a second install is a no-op (or chains with an existing hook installed
   * by React DevTools).
   */
  install(): void

  /**
   * Look up the component name for a DOM element by walking its fiber.
   */
  resolveComponentFromElement(el: HTMLElement): string | null
}

/**
 * Minimal shape of a React fiber node that we touch. The real fiber has
 * many more fields; we only declare what we read.
 */
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

/**
 * The DevTools global hook React looks for at module load time. We register
 * our own listener via `onCommitFiberRoot`.
 */
export interface ReactDevToolsHook {
  onCommitFiberRoot?: (
    rendererId: number,
    root: { current: MinimalFiber },
    priorityLevel?: unknown
  ) => void
  // React DevTools sets many more fields; we only need this one.
  [key: string]: unknown
}

/**
 * Re-export for convenience.
 */
export type { Collector }
```

- [ ] **Step 2: Re-export from `packages/react/src/index.ts`**

```ts
export * from './types'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @react-perfscope/react typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src
git commit -m "feat(react): define ReactAdapter and fiber types"
```

---

## Task 5: Install DevTools global hook (TDD)

**Goal:** Install a `__REACT_DEVTOOLS_GLOBAL_HOOK__` on `globalThis` if absent, OR chain our `onCommitFiberRoot` listener if it already exists (so we coexist with the real React DevTools).

**Files:**
- Create: `packages/react/tests/devtools-hook.test.ts`
- Create: `packages/react/src/devtools-hook.ts`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/react/tests/devtools-hook.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installDevToolsHook, uninstallDevToolsHook } from '../src/devtools-hook'
import type { ReactDevToolsHook } from '../src/types'

beforeEach(() => {
  // Clear both the global hook and any listeners left behind by earlier tests.
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

describe('installDevToolsHook', () => {
  it('creates the global hook when none exists', () => {
    installDevToolsHook(() => {})
    expect((globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__).toBeDefined()
  })

  it('routes commits to the registered listener', () => {
    const received: number[] = []
    installDevToolsHook((root) => {
      received.push((root.current as { stateNode: number }).stateNode as number)
    })
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 42 } as never }, undefined)
    expect(received).toEqual([42])
  })

  it('chains with an existing hook (preserves prior onCommitFiberRoot)', () => {
    const priorCommits: unknown[] = []
    ;(globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      onCommitFiberRoot(_rendererId, root) {
        priorCommits.push(root)
      },
    }
    const ourCommits: unknown[] = []
    installDevToolsHook((root) => {
      ourCommits.push(root)
    })
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    const fakeRoot = { current: { stateNode: 99 } as never }
    hook.onCommitFiberRoot!(1, fakeRoot, undefined)
    expect(priorCommits).toHaveLength(1)
    expect(ourCommits).toHaveLength(1)
  })

  it('uninstallDevToolsHook removes our listener while preserving prior', () => {
    const priorCommits: unknown[] = []
    ;(globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      onCommitFiberRoot(_rendererId, root) {
        priorCommits.push(root)
      },
    }
    const ourCommits: unknown[] = []
    const unsubscribe = installDevToolsHook((root) => {
      ourCommits.push(root)
    })
    unsubscribe()
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)
    expect(priorCommits).toHaveLength(1)
    expect(ourCommits).toHaveLength(0)
  })

  it('multiple installs all receive commits', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    installDevToolsHook((root) => a.push(root))
    installDevToolsHook((root) => b.push(root))
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('listener errors do not break other listeners', () => {
    const ok: unknown[] = []
    installDevToolsHook(() => {
      throw new Error('boom')
    })
    installDevToolsHook((root) => ok.push(root))
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    expect(() => hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)).not.toThrow()
    expect(ok).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/react/tests/devtools-hook.test.ts`
Expected: Tests fail because `installDevToolsHook` / `uninstallDevToolsHook` don't exist.

- [ ] **Step 3: Implement `installDevToolsHook`**

Create `packages/react/src/devtools-hook.ts`:

```ts
import type { MinimalFiber, ReactDevToolsHook } from './types'

type CommitListener = (root: { current: MinimalFiber }, rendererId: number) => void

const HOOK_KEY = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

interface GlobalWithHook {
  [HOOK_KEY]?: ReactDevToolsHook
}

const listeners = new Set<CommitListener>()
let ourHook: ReactDevToolsHook | null = null
let chainedOriginal: ReactDevToolsHook['onCommitFiberRoot'] | null = null

function ensureHookInstalled(): void {
  const g = globalThis as GlobalWithHook
  // Already ours and still installed — nothing to do.
  if (ourHook && g[HOOK_KEY] === ourHook) return

  const existing = g[HOOK_KEY]
  chainedOriginal =
    existing && existing !== ourHook && typeof existing.onCommitFiberRoot === 'function'
      ? existing.onCommitFiberRoot
      : null

  const hook: ReactDevToolsHook = existing && existing !== ourHook ? existing : {}
  hook.onCommitFiberRoot = (rendererId, root, priorityLevel) => {
    if (chainedOriginal) {
      try {
        chainedOriginal(rendererId, root, priorityLevel)
      } catch (err) {
        console.warn('[react-perfscope] chained DevTools hook threw:', err)
      }
    }
    for (const cb of listeners) {
      try {
        cb(root, rendererId)
      } catch (err) {
        console.warn('[react-perfscope] commit listener threw:', err)
      }
    }
  }
  g[HOOK_KEY] = hook
  ourHook = hook
}

export function installDevToolsHook(listener: CommitListener): () => void {
  ensureHookInstalled()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clears all listeners and forgets our installed hook reference. Used by
 * tests to fully reset module state. Does NOT remove the hook from
 * globalThis — callers that want a fully clean slate must also
 * `delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__`.
 */
export function uninstallDevToolsHook(): void {
  listeners.clear()
  ourHook = null
  chainedOriginal = null
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/react/tests/devtools-hook.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Re-export from index**

Update `packages/react/src/index.ts`:

```ts
export * from './types'
export { installDevToolsHook, uninstallDevToolsHook } from './devtools-hook'
```

- [ ] **Step 6: Run full suite (core + react) + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 70 tests pass (64 core + 6 react), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src packages/react/tests
git commit -m "feat(react): install DevTools global hook with listener chaining"
```

---

## Task 6: Component name resolution from fiber

**Goal:** Walk up from a fiber to find the nearest function/class component name. Used both by the render collector (to label changed components) and by attribution (DOM element → component name).

**Files:**
- Create: `packages/react/tests/fiber-walker.test.ts`
- Create: `packages/react/src/fiber-walker.ts`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/react/tests/fiber-walker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fiberComponentName, walkChangedFibers } from '../src/fiber-walker'
import type { MinimalFiber } from '../src/types'

function makeFiber(type: unknown, opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    ...opts,
  } as MinimalFiber
}

describe('fiberComponentName', () => {
  it('returns the displayName for function components', () => {
    const fn = function MyComp() { return null }
    ;(fn as { displayName?: string }).displayName = 'MyComponent'
    expect(fiberComponentName(makeFiber(fn))).toBe('MyComponent')
  })

  it('falls back to function.name when displayName missing', () => {
    function PlainComp() { return null }
    expect(fiberComponentName(makeFiber(PlainComp))).toBe('PlainComp')
  })

  it('returns string for host components (DOM tags)', () => {
    expect(fiberComponentName(makeFiber('div'))).toBe('div')
    expect(fiberComponentName(makeFiber('button'))).toBe('button')
  })

  it('returns null for fibers with no recognizable type', () => {
    expect(fiberComponentName(makeFiber(null))).toBe(null)
    expect(fiberComponentName(makeFiber(undefined))).toBe(null)
  })

  it('handles class components via constructor name', () => {
    class FooComponent {
      render() { return null }
    }
    expect(fiberComponentName(makeFiber(FooComponent))).toBe('FooComponent')
  })

  it('handles memo-wrapped components (type.type.displayName)', () => {
    const inner = function InnerFn() { return null }
    ;(inner as { displayName?: string }).displayName = 'InnerNamed'
    const memoWrap = { $$typeof: Symbol.for('react.memo'), type: inner }
    expect(fiberComponentName(makeFiber(memoWrap))).toBe('InnerNamed')
  })

  it('handles forwardRef components (type.render.displayName)', () => {
    const render = function ForwardImpl() { return null }
    ;(render as { displayName?: string }).displayName = 'ForwardedNamed'
    const forwardWrap = { $$typeof: Symbol.for('react.forward_ref'), render }
    expect(fiberComponentName(makeFiber(forwardWrap))).toBe('ForwardedNamed')
  })
})

describe('walkChangedFibers', () => {
  it('visits root and all descendants via child/sibling links', () => {
    const grandchild = makeFiber('span')
    const child = makeFiber('div', { child: grandchild })
    const root = makeFiber('section', { child })
    grandchild.return = child
    child.return = root

    const visited: unknown[] = []
    walkChangedFibers(root, (f) => visited.push(f.type))
    expect(visited).toEqual(['section', 'div', 'span'])
  })

  it('also follows siblings', () => {
    const sibling = makeFiber('em')
    const child = makeFiber('div', { sibling })
    sibling.return = makeFiber('section', { child })
    child.return = sibling.return!

    const visited: unknown[] = []
    walkChangedFibers(child.return!, (f) => visited.push(f.type))
    expect(visited).toEqual(['section', 'div', 'em'])
  })

  it('does not visit beyond a stopAt limit', () => {
    // Make a long linear tree
    let current = makeFiber(0)
    const root = current
    for (let i = 1; i < 50; i++) {
      const next = makeFiber(i, { return: current })
      current.child = next
      current = next
    }
    const visited: unknown[] = []
    walkChangedFibers(root, (f) => visited.push(f.type), { stopAt: 10 })
    expect(visited.length).toBeLessThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/react/tests/fiber-walker.test.ts`
Expected: Tests fail (module not found).

- [ ] **Step 3: Implement `fiber-walker.ts`**

Create `packages/react/src/fiber-walker.ts`:

```ts
import type { MinimalFiber } from './types'

const MEMO_TYPE = Symbol.for('react.memo')
const FORWARD_REF_TYPE = Symbol.for('react.forward_ref')

type WrapperType = {
  $$typeof: symbol
  type?: unknown
  render?: unknown
}

function namedFunctionName(value: unknown): string | null {
  if (typeof value !== 'function') return null
  const fn = value as { displayName?: string; name?: string }
  if (typeof fn.displayName === 'string' && fn.displayName.length > 0) return fn.displayName
  if (typeof fn.name === 'string' && fn.name.length > 0) return fn.name
  return null
}

/**
 * Return the component name for a fiber.
 *
 * Host components (DOM tags) return their tag string. Function and class
 * components return their displayName or name. Memo and forwardRef wrappers
 * are unwrapped to their inner component. Unknown shapes return null.
 */
export function fiberComponentName(fiber: MinimalFiber | null): string | null {
  if (!fiber) return null
  const type = fiber.type
  if (typeof type === 'string') return type
  if (typeof type === 'function') return namedFunctionName(type)
  if (type && typeof type === 'object') {
    const wrapper = type as WrapperType
    if (wrapper.$$typeof === MEMO_TYPE) {
      return namedFunctionName(wrapper.type)
    }
    if (wrapper.$$typeof === FORWARD_REF_TYPE) {
      return namedFunctionName(wrapper.render)
    }
  }
  return null
}

interface WalkOptions {
  /**
   * Maximum number of fibers to visit. Prevents runaway traversal on very
   * deep trees. Default 10_000.
   */
  stopAt?: number
}

/**
 * Walk a fiber subtree depth-first, invoking `visit` for every fiber.
 * Returns early once `stopAt` fibers have been visited.
 */
export function walkChangedFibers(
  root: MinimalFiber,
  visit: (fiber: MinimalFiber) => void,
  opts: WalkOptions = {}
): void {
  const max = opts.stopAt ?? 10_000
  let count = 0
  let node: MinimalFiber | null = root
  while (node) {
    visit(node)
    count++
    if (count >= max) return
    if (node.child) {
      node = node.child
      continue
    }
    while (node && !node.sibling) {
      if (node === root) return
      node = node.return
    }
    if (!node || node === root) return
    node = node.sibling
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/react/tests/fiber-walker.test.ts`
Expected: 10/10 pass (7 `fiberComponentName` + 3 `walkChangedFibers`).

- [ ] **Step 5: Re-export from index**

Update `packages/react/src/index.ts`:

```ts
export * from './types'
export { installDevToolsHook, uninstallDevToolsHook } from './devtools-hook'
export { fiberComponentName, walkChangedFibers } from './fiber-walker'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 80 tests pass (70 + 10), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src packages/react/tests
git commit -m "feat(react): component name resolution + fiber tree walker"
```

---

## Task 7: Element → component attribution

**Goal:** Given a DOM element, find the nearest React component name by walking the fiber chain. React 18 attaches the fiber to a DOM element via a `__reactFiber$<random>` property. Walk up from there to find a non-host fiber.

**Files:**
- Create: `packages/react/tests/attribution.test.ts`
- Create: `packages/react/src/attribution.ts`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/react/tests/attribution.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveComponentFromElement } from '../src/attribution'
import type { MinimalFiber } from '../src/types'

function attachFiberToElement(el: HTMLElement, fiber: MinimalFiber) {
  ;(el as HTMLElement & Record<string, MinimalFiber>)['__reactFiber$test'] = fiber
}

describe('resolveComponentFromElement', () => {
  it('returns the nearest non-host component name', () => {
    function MyButton() { return null }
    const componentFiber: MinimalFiber = {
      stateNode: null,
      type: MyButton,
      return: null,
      child: null,
      sibling: null,
      alternate: null,
    }
    const hostFiber: MinimalFiber = {
      stateNode: null,
      type: 'button',
      return: componentFiber,
      child: null,
      sibling: null,
      alternate: null,
    }
    const el = document.createElement('button')
    attachFiberToElement(el, hostFiber)
    expect(resolveComponentFromElement(el)).toBe('MyButton')
  })

  it('returns the host tag if no parent component fiber exists', () => {
    const hostFiber: MinimalFiber = {
      stateNode: null,
      type: 'div',
      return: null,
      child: null,
      sibling: null,
      alternate: null,
    }
    const el = document.createElement('div')
    attachFiberToElement(el, hostFiber)
    expect(resolveComponentFromElement(el)).toBe('div')
  })

  it('returns null when no fiber is attached', () => {
    const el = document.createElement('div')
    expect(resolveComponentFromElement(el)).toBe(null)
  })

  it('walks past multiple host fibers to find component', () => {
    function Wrapper() { return null }
    const compFiber: MinimalFiber = {
      stateNode: null, type: Wrapper, return: null, child: null, sibling: null, alternate: null,
    }
    const hostA: MinimalFiber = {
      stateNode: null, type: 'section', return: compFiber, child: null, sibling: null, alternate: null,
    }
    const hostB: MinimalFiber = {
      stateNode: null, type: 'div', return: hostA, child: null, sibling: null, alternate: null,
    }
    const hostC: MinimalFiber = {
      stateNode: null, type: 'span', return: hostB, child: null, sibling: null, alternate: null,
    }
    const el = document.createElement('span')
    attachFiberToElement(el, hostC)
    expect(resolveComponentFromElement(el)).toBe('Wrapper')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/react/tests/attribution.test.ts`
Expected: 4 tests fail (module not found).

- [ ] **Step 3: Implement `attribution.ts`**

Create `packages/react/src/attribution.ts`:

```ts
import type { MinimalFiber } from './types'
import { fiberComponentName } from './fiber-walker'

const FIBER_KEY_PATTERNS = ['__reactFiber$', '__reactInternalInstance$']

function findFiberOnElement(el: HTMLElement): MinimalFiber | null {
  for (const key of Object.keys(el)) {
    for (const pattern of FIBER_KEY_PATTERNS) {
      if (key.startsWith(pattern)) {
        return (el as HTMLElement & Record<string, MinimalFiber>)[key] ?? null
      }
    }
  }
  return null
}

/**
 * Walk up from the fiber attached to `el` until we find one whose `type` is
 * a function or class component (not a host tag string). Returns that
 * component's display name. If no component is found, returns the host
 * tag name. If no fiber is attached, returns null.
 */
export function resolveComponentFromElement(el: HTMLElement): string | null {
  const start = findFiberOnElement(el)
  if (!start) return null
  let node: MinimalFiber | null = start
  while (node) {
    if (typeof node.type === 'function' || (node.type && typeof node.type === 'object')) {
      const name = fiberComponentName(node)
      if (name) return name
    }
    node = node.return
  }
  // Nothing but host fibers above — return the host tag name of the starting fiber.
  return fiberComponentName(start)
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/react/tests/attribution.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Re-export from index**

Update `packages/react/src/index.ts`:

```ts
export * from './types'
export { installDevToolsHook, uninstallDevToolsHook } from './devtools-hook'
export { fiberComponentName, walkChangedFibers } from './fiber-walker'
export { resolveComponentFromElement } from './attribution'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 84 tests pass (80 + 4), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src packages/react/tests
git commit -m "feat(react): element → component attribution via fiber walk"
```

---

## Task 8: Render collector

**Goal:** A `Collector` that emits a `RenderSignal` for every commit, naming the changed components. Plug into Recorder via `recorder.use(createRenderCollector())`.

**Files:**
- Create: `packages/react/tests/render-collector.test.ts`
- Create: `packages/react/src/render-collector.ts`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/react/tests/render-collector.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRenderCollector } from '../src/render-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { Signal, RenderSignal } from '@react-perfscope/core'
import type { MinimalFiber, ReactDevToolsHook } from '../src/types'

beforeEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

function fireCommit(root: MinimalFiber) {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  hook?.onCommitFiberRoot?.(1, { current: root })
}

function makeFiber(type: unknown, opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    ...opts,
  } as MinimalFiber
}

describe('render collector', () => {
  it('reports kind: "render"', () => {
    const collector = createRenderCollector()
    expect(collector.kind).toBe('render')
  })

  it('emits RenderSignal for each named component on commit', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      function Bar() { return null }
      const fooFiber = makeFiber(Foo)
      const barFiber = makeFiber(Bar, { return: fooFiber })
      fooFiber.child = barFiber
      fireCommit(fooFiber)
      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('Foo')
      expect(names).toContain('Bar')
    } finally {
      collector.deactivate()
    }
  })

  it('skips host fibers (DOM tags) when emitting renders', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function App() { return null }
      const appFiber = makeFiber(App)
      const divFiber = makeFiber('div', { return: appFiber })
      appFiber.child = divFiber
      fireCommit(appFiber)
      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('App')
      expect(names).not.toContain('div')
    } finally {
      collector.deactivate()
    }
  })

  it('does not emit when not active', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    collector.deactivate()
    function Foo() { return null }
    fireCommit(makeFiber(Foo))
    expect(got).toHaveLength(0)
  })

  it('sets at to a number and duration to 0 (Phase 3 placeholder)', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      fireCommit(makeFiber(Foo))
      const s = got[0] as RenderSignal
      expect(typeof s.at).toBe('number')
      expect(s.duration).toBe(0)
      expect(typeof s.reason).toBe('string')
    } finally {
      collector.deactivate()
    }
  })

  it('reactivate after deactivate continues to work (single global hook)', () => {
    const collector = createRenderCollector()
    const first: Signal[] = []
    collector.activate((s) => first.push(s))
    collector.deactivate()
    const second: Signal[] = []
    collector.activate((s) => second.push(s))
    try {
      function Foo() { return null }
      fireCommit(makeFiber(Foo))
      expect(first).toHaveLength(0)
      expect(second.length).toBeGreaterThanOrEqual(1)
    } finally {
      collector.deactivate()
    }
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/react/tests/render-collector.test.ts`
Expected: 6 tests fail (module not found).

- [ ] **Step 3: Implement `render-collector.ts`**

Create `packages/react/src/render-collector.ts`:

```ts
import type { Collector, Signal } from '@react-perfscope/core'
import { installDevToolsHook } from './devtools-hook'
import { fiberComponentName, walkChangedFibers } from './fiber-walker'

export function createRenderCollector(): Collector {
  let active = false
  let emit: (signal: Signal) => void = () => {}
  let unsubscribe: (() => void) | null = null

  function onCommit(root: { current: import('./types').MinimalFiber }) {
    if (!active) return
    const at = performance.now()
    walkChangedFibers(root.current, (fiber) => {
      // Skip host (DOM) fibers — we only want function/class components in
      // render reports.
      if (typeof fiber.type === 'string') return
      const name = fiberComponentName(fiber)
      if (!name) return
      emit({
        kind: 'render',
        at,
        component: name,
        reason: 'commit',
        duration: 0,
      })
    })
  }

  return {
    kind: 'render',
    activate(emitFn) {
      emit = emitFn
      active = true
      if (unsubscribe) return
      unsubscribe = installDevToolsHook(onCommit)
    },
    deactivate() {
      active = false
      // Keep the global hook listener attached — installDevToolsHook is
      // idempotent and removing it on every deactivate would cost us the
      // ability to re-attach cleanly under the test reset hooks. The
      // `active` flag gates emission.
    },
  }
}
```

Note: we intentionally do NOT call `unsubscribe()` in `deactivate()` to mirror the gated-emission pattern used by the `web-vitals` collector. If you decide to truly tear down on deactivate, also clear the global hook in tests' `afterEach`. The current behavior matches the test expectation in "reactivate after deactivate continues to work".

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/react/tests/render-collector.test.ts`
Expected: 6/6 pass.

- [ ] **Step 5: Re-export from index**

Update `packages/react/src/index.ts`:

```ts
export * from './types'
export { installDevToolsHook, uninstallDevToolsHook } from './devtools-hook'
export { fiberComponentName, walkChangedFibers } from './fiber-walker'
export { resolveComponentFromElement } from './attribution'
export { createRenderCollector } from './render-collector'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 90 tests pass (84 + 6), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src packages/react/tests
git commit -m "feat(react): render collector via DevTools commit hook"
```

---

## Task 9: Integration smoke test — Recorder + render collector

**Goal:** End-to-end test that a Recorder using the render collector receives signals when commits fire via the simulated DevTools hook. Sanity check that the wiring works without React itself being mounted (we don't depend on react-dom in this test).

**Files:**
- Create: `packages/react/tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `packages/react/tests/integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRecorder } from '@react-perfscope/core'
import type { Signal, RenderSignal } from '@react-perfscope/core'
import { createRenderCollector } from '../src/render-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { MinimalFiber, ReactDevToolsHook } from '../src/types'

beforeEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

function fireCommit(root: MinimalFiber) {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  hook?.onCommitFiberRoot?.(1, { current: root })
}

function makeFiber(type: unknown, opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    ...opts,
  } as MinimalFiber
}

describe('Recorder + render collector integration', () => {
  it('captures render signals during a recording session', () => {
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    recorder.start()

    function App() { return null }
    function Header() { return null }
    const appFiber = makeFiber(App)
    const headerFiber = makeFiber(Header, { return: appFiber })
    appFiber.child = headerFiber
    fireCommit(appFiber)

    const result = recorder.stop()
    const renders = result.signals.filter((s: Signal) => s.kind === 'render') as RenderSignal[]
    const names = renders.map((s) => s.component)
    expect(names).toContain('App')
    expect(names).toContain('Header')
  })

  it('does not capture renders fired before start or after stop', () => {
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    function Foo() { return null }

    // Before start
    fireCommit(makeFiber(Foo))

    recorder.start()
    fireCommit(makeFiber(Foo))
    recorder.stop()

    // After stop
    fireCommit(makeFiber(Foo))

    recorder.start()
    const result = recorder.stop()
    expect(result.signals.filter((s) => s.kind === 'render')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm test packages/react/tests/integration.test.ts`
Expected: 2/2 pass.

- [ ] **Step 3: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 92 tests pass (90 + 2), typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add packages/react/tests
git commit -m "test(react): integration test — Recorder + render collector"
```

---

## Task 10: Phase 3 final API + README + build verification

**Files:**
- Verify: `packages/react/src/index.ts`
- Create: `packages/react/README.md`

- [ ] **Step 1: Verify `packages/react/src/index.ts`**

Open `packages/react/src/index.ts` and confirm it reads exactly as:

```ts
export * from './types'
export { installDevToolsHook, uninstallDevToolsHook } from './devtools-hook'
export { fiberComponentName, walkChangedFibers } from './fiber-walker'
export { resolveComponentFromElement } from './attribution'
export { createRenderCollector } from './render-collector'
```

If anything differs, adjust to match.

- [ ] **Step 2: Create `packages/react/README.md`**

Overwrite (or create) `packages/react/README.md` with this exact content:

~~~markdown
# @react-perfscope/react

React 18+ adapter for `react-perfscope`. Installs a DevTools global hook to observe commits, walks fiber trees, and exposes a render collector that plugs into `@react-perfscope/core`.

## Status

Phase 3 — initial implementation. Render collector emits one `RenderSignal` per changed component per commit. Duration is a Phase 3 placeholder (always 0); Phase 4 will pair with React Profiler timings.

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

## Caveats

- `RenderSignal.duration` is always `0` in Phase 3. Wiring real timings (via React Profiler API) is Phase 4.
- The render collector keeps its DevTools hook listener attached across deactivate cycles (emission is gated by an `active` flag). This mirrors the `web-vitals` collector's lifecycle.
~~~

The file ends after the closing ts code fence with no trailing content. Do not include the surrounding `~~~` in the actual file.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors in either package.

- [ ] **Step 4: Build**

Run: `pnpm --filter @react-perfscope/react build`
Expected: `packages/react/dist/` contains `index.js`, `.cjs`, `.d.ts`, `.d.cts`, `.js.map`, `.cjs.map`. Postbuild script logs prepending lib refs.

- [ ] **Step 5: Inspect public API surface**

Run: `head -3 packages/react/dist/index.d.ts`
Expected: First two lines are the `/// <reference lib="es2015" />` and `/// <reference lib="dom" />` banners.

Run: `grep -E '^(export|declare)' packages/react/dist/index.d.ts | head -20`
Expected: Exports include `createRenderCollector`, `resolveComponentFromElement`, `installDevToolsHook`, `uninstallDevToolsHook`, `fiberComponentName`, `walkChangedFibers`, type aliases.

- [ ] **Step 6: Full test run**

Run: `pnpm test`
Expected: All 92 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/index.ts packages/react/README.md
git commit -m "feat(react): finalize Phase 3 exports + README"
```

---

## Phase 3 Acceptance Criteria

After all 10 tasks complete:

- [ ] On branch `phase-3-react-adapter`
- [ ] `pnpm test` passes 100% (92 tests; 64 core + 28 react)
- [ ] `pnpm typecheck` clean across both packages
- [ ] `pnpm --filter @react-perfscope/react build` produces `dist/` with lib refs prepended
- [ ] `@react-perfscope/react` exports: `createRenderCollector`, `resolveComponentFromElement`, `installDevToolsHook`, `uninstallDevToolsHook`, `fiberComponentName`, `walkChangedFibers`, plus types
- [ ] web-vitals re-subscription fixed and verified by 2 new tests
- [ ] `'FID'` removed from `WebVitalSignal['name']` union
- [ ] DevTools hook installation chains with existing hook (React DevTools coexistence)
- [ ] Render collector emits `RenderSignal` for non-host fibers on commit

## Next Phase Preview (Phase 4)

- `@react-perfscope/ui`: Preact-based widget + Shadow DOM mount + 7-tab signal panel + DOM overlay for highlighted elements
- Wire `RenderSignal.duration` to actual React Profiler timings
- Pair paint events with MutationObserver records for real `PaintSignal.rect` and `cause`
