# react-perfscope Phase 2 — Complete @react-perfscope/core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish `@react-perfscope/core` by adding the remaining 4 collectors (layout-shift, paint, web-vitals, network), tightening the public API (hide `__push`, expose `use` on `Recorder`), and improving forced-reflow accuracy (dirty tracking) and performance (lazy stack parsing).

**Architecture:** Continue the Phase 1 layout: collectors live under `packages/core/src/collectors/`, each implementing the `Collector` interface. `web-vitals` library is the only new external dep (wraps the official Google library). Dirty tracking uses `MutationObserver.takeRecords()` to synchronously check for pending DOM mutations before each layout read. Lazy stack parsing uses a getter property on the emitted Signal so callers see the same shape (`stack: StackFrame[]`) but `parseStack` only runs on first access.

**Tech Stack:** Continues Phase 1 (pnpm, TypeScript 5+, tsup, vitest, happy-dom, source-map). Adds `web-vitals ^4.0.0`.

**Working Directory:** All paths are relative to `/Users/ray/workspace/react-perfscope`. Work on branch `phase-2-core-complete` (created from `master` in Task 0).

**Phase 1 → Phase 2 changes summarized:**
- Cleanup: `__push` removed from public type; `use` moved to public `Recorder` interface; lazy stack parsing on forced-reflow; dirty tracking on forced-reflow.
- New collectors: `createLayoutShiftCollector`, `createPaintCollector`, `createWebVitalsCollector`, `createNetworkCollector`.

---

## Task 0: Create Phase 2 branch

**Files:** None — branch operation only.

- [ ] **Step 1: Create and switch to the Phase 2 branch**

```bash
cd /Users/ray/workspace/react-perfscope
git checkout master
git checkout -b phase-2-core-complete
git branch --show-current
```

Expected: `phase-2-core-complete`

- [ ] **Step 2: Verify clean working state**

Run: `git status`
Expected: `nothing to commit, working tree clean` on branch `phase-2-core-complete`.

(No commit yet — first commit comes in Task 1.)

---

## Task 1: Tighten public API — `use` on `Recorder`, hide `__push`

**Goal:** Move `use(collector)` to the public `Recorder` interface so consumers can call it without TS gymnastics. Remove `InternalRecorder` from `index.ts` exports. Tests can still access `__push` via a direct relative import of `recorder.ts`.

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/recorder.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/recorder.test.ts` (cleanup type casts)
- Modify: `packages/core/README.md`

- [ ] **Step 1: Move `use` onto the public Recorder interface**

In `packages/core/src/types.ts`, replace the existing `Recorder` interface with:

```ts
export interface Recorder {
  start(): void
  stop(): RecordingResult
  isRecording(): boolean
  onSignal(cb: (signal: Signal) => void): () => void
  use(collector: Collector): void
}
```

(That adds the `use` method at the bottom; the other four methods are unchanged.)

- [ ] **Step 2: Update `InternalRecorder` and the index exports**

In `packages/core/src/recorder.ts`, the `InternalRecorder` interface should drop the `use` redundancy (it's already on `Recorder` now). Replace the existing `InternalRecorder` declaration with:

```ts
export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
}
```

In `packages/core/src/index.ts`, remove the `InternalRecorder` re-export. The file should be:

```ts
// Types
export * from './types'

// Recorder
export { createRecorder } from './recorder'

// Sourcemap utilities
export { parseStack, resolveFrame } from './sourcemap'
export type { FetchMap } from './sourcemap'

// Collectors
export { createLongTasksCollector } from './collectors/long-tasks'
export { createForcedReflowCollector } from './collectors/forced-reflow'
```

- [ ] **Step 3: Change `createRecorder`'s public return type**

`createRecorder` will still construct an `InternalRecorder` internally, but its declared return type changes to `Recorder` so consumers can't see `__push`. Tests that need `__push` import `InternalRecorder` directly from `'../src/recorder'`.

In `packages/core/src/recorder.ts`, change the function signature from:

```ts
export function createRecorder(): InternalRecorder {
```

to:

```ts
export function createRecorder(): Recorder {
```

The body is unchanged — TypeScript still accepts the wider return because the object literal satisfies `InternalRecorder` which extends `Recorder`.

- [ ] **Step 4: Update tests to import `InternalRecorder` directly**

In `packages/core/tests/recorder.test.ts`, find the first `import` block and update it (keep all existing imports, add `InternalRecorder` from recorder module):

Add this import at the top alongside the existing imports:

```ts
import type { InternalRecorder } from '../src/recorder'
```

Then in each test that previously used the cast pattern `createRecorder() as ReturnType<typeof createRecorder> & { __push: (s: Signal) => void }`, replace with:

```ts
const r = createRecorder() as InternalRecorder
```

There are 4 such call sites in the "Recorder signal buffering" describe block. Replace each one. The "Recorder onSignal subscription" block also accesses `__push` — for those 4 tests change `const r = createRecorder()` to `const r = createRecorder() as InternalRecorder`. (The basic state-machine tests in the first describe block don't touch `__push` and don't need the cast.)

- [ ] **Step 5: Update README example (no changes to user-facing code)**

In `packages/core/README.md`, no change needed — the existing example already only uses `use`, `start`, `stop`, and `result.signals`, all public.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @react-perfscope/core typecheck`
Expected: No errors.

- [ ] **Step 7: Run tests**

Run: `pnpm test`
Expected: 36/36 still pass. No behavior change.

- [ ] **Step 8: Run build**

Run: `pnpm --filter @react-perfscope/core build`
Expected: `dist/index.d.ts` no longer exports `InternalRecorder`.

Verify: `grep InternalRecorder packages/core/dist/index.d.ts`
Expected: no matches (InternalRecorder is no longer in the public surface).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "refactor(core): hide __push, move use() onto public Recorder"
```

---

## Task 2: Lazy stack parsing infrastructure

**Goal:** Introduce a helper that captures a raw stack string and exposes `stack: StackFrame[]` as a lazy memoized getter. The Signal shape stays the same (consumers still read `signal.stack`); `parseStack` only runs on first access.

**Files:**
- Modify: `packages/core/src/sourcemap.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/lazy-stack.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/lazy-stack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { attachLazyStack } from '../src/sourcemap'

describe('attachLazyStack', () => {
  it('installs `stack` as a getter (not a data property)', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, 'Error\n    at foo (http://x/a.ts:1:1)')
    const desc = Object.getOwnPropertyDescriptor(signal, 'stack')
    expect(desc).toBeDefined()
    expect(typeof desc!.get).toBe('function')
    expect((desc as { value?: unknown }).value).toBeUndefined()
  })

  it('memoizes — repeated access returns the same array reference', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, 'Error\n    at foo (http://x/a.ts:1:1)')
    const s1 = (signal as unknown as { stack: unknown[] }).stack
    const s2 = (signal as unknown as { stack: unknown[] }).stack
    expect(s1).toBe(s2)
  })

  it('produces parsed frames matching parseStack output', () => {
    const raw = `Error
    at doWork (http://localhost:3000/src/app.ts:42:13)`
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, raw)
    expect((signal as unknown as { stack: unknown[] }).stack).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
    ])
  })

  it('handles undefined raw stack (returns empty array)', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, undefined)
    expect((signal as unknown as { stack: unknown[] }).stack).toEqual([])
  })
})
```

(We test "lazy" structurally — by asserting `stack` is a getter — instead of spying on `parseStack`. The spy approach doesn't work here because `attachLazyStack` lives in the same module as `parseStack` and calls it by local reference, which `vi.spyOn` on the module namespace cannot intercept.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/core/tests/lazy-stack.test.ts`
Expected: FAIL with `attachLazyStack` not found.

- [ ] **Step 3: Implement `attachLazyStack`**

Append to `packages/core/src/sourcemap.ts`:

```ts
/**
 * Attach a lazy `stack` getter to `target` that parses `raw` on first access
 * and memoizes the result. Use this from collectors to defer parseStack cost
 * until a consumer actually reads `signal.stack`.
 */
export function attachLazyStack(target: object, raw: string | undefined): void {
  let cached: StackFrame[] | null = null
  Object.defineProperty(target, 'stack', {
    enumerable: true,
    configurable: true,
    get() {
      if (cached === null) {
        cached = parseStack(raw)
      }
      return cached
    },
  })
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/lazy-stack.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Re-export from index**

In `packages/core/src/index.ts`, update the sourcemap exports section to:

```ts
// Sourcemap utilities
export { parseStack, resolveFrame, attachLazyStack } from './sourcemap'
export type { FetchMap } from './sourcemap'
```

- [ ] **Step 6: Run full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: All tests pass (40 total = 36 + 4), no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add attachLazyStack for deferred stack parsing"
```

---

## Task 3: Apply lazy stack parsing to forced-reflow collector

**Goal:** Replace the eager `parseStack(new Error().stack)` calls in forced-reflow with `attachLazyStack`. Behavior is observably identical — `signal.stack` still returns parsed frames — but parsing is deferred.

**Files:**
- Modify: `packages/core/src/collectors/forced-reflow.ts`
- Modify: `packages/core/tests/collectors/forced-reflow.test.ts`

- [ ] **Step 1: Update forced-reflow to use `attachLazyStack`**

In `packages/core/src/collectors/forced-reflow.ts`, change the import block from:

```ts
import type { Collector, Signal } from '../types'
import { parseStack } from '../sourcemap'
```

to:

```ts
import type { Collector, Signal } from '../types'
import { attachLazyStack } from '../sourcemap'
```

Then inside `patchGetter`, replace the body of the `if (active)` block:

Before:
```ts
if (active) {
  const at = performance.now()
  const stack = parseStack(new Error().stack)
  const value = originalGet.call(this)
  const duration = performance.now() - at
  emit({ kind: 'forced-reflow', at, duration, stack })
  return value
}
```

After:
```ts
if (active) {
  const at = performance.now()
  const rawStack = new Error().stack
  const value = originalGet.call(this)
  const duration = performance.now() - at
  const signal = { kind: 'forced-reflow' as const, at, duration } as unknown as Signal
  attachLazyStack(signal, rawStack)
  emit(signal)
  return value
}
```

Apply the same transformation to the `if (active)` block inside `patchMethod`:

Before:
```ts
if (active) {
  const at = performance.now()
  const stack = parseStack(new Error().stack)
  const value = original.apply(this, args)
  const duration = performance.now() - at
  emit({ kind: 'forced-reflow', at, duration, stack })
  return value
}
```

After:
```ts
if (active) {
  const at = performance.now()
  const rawStack = new Error().stack
  const value = original.apply(this, args)
  const duration = performance.now() - at
  const signal = { kind: 'forced-reflow' as const, at, duration } as unknown as Signal
  attachLazyStack(signal, rawStack)
  emit(signal)
  return value
}
```

- [ ] **Step 2: Add a test for lazy stack on emitted forced-reflow signals**

Append to `packages/core/tests/collectors/forced-reflow.test.ts`:

```ts
describe('forced-reflow collector lazy stack', () => {
  it('emits signals whose `stack` is implemented as a lazy getter', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      expect(got.length).toBeGreaterThanOrEqual(1)
      const signal = got[0]!
      const desc = Object.getOwnPropertyDescriptor(signal, 'stack')
      expect(desc).toBeDefined()
      expect(typeof desc!.get).toBe('function')
      expect((desc as { value?: unknown }).value).toBeUndefined()
      // Reading still works
      expect(Array.isArray((signal as ForcedReflowSignal).stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm test packages/core/tests/collectors/forced-reflow.test.ts`
Expected: 7 tests pass (6 existing + 1 new).

- [ ] **Step 4: Run full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 41 tests pass total, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "perf(core): defer stack parsing in forced-reflow via attachLazyStack"
```

---

## Task 4: Forced-reflow dirty tracking via `MutationObserver.takeRecords()`

**Goal:** Only emit a forced-reflow signal if there was a DOM mutation since the last layout read. This drops the over-reporting noise. Implementation uses a MutationObserver attached to `document` with a no-op callback; `takeRecords()` is called synchronously inside each patched getter/method to peek at pending mutations.

**Files:**
- Modify: `packages/core/src/collectors/forced-reflow.ts`
- Modify: `packages/core/tests/collectors/forced-reflow.test.ts`
- Modify: `packages/core/README.md`

- [ ] **Step 1: Write a failing test for dirty gating**

Append to `packages/core/tests/collectors/forced-reflow.test.ts`:

```ts
describe('forced-reflow collector dirty tracking', () => {
  it('does not emit when no DOM mutation occurred since last read', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      // First read after appendChild is "dirty" — emits.
      void div.offsetWidth
      const afterFirst = got.length
      expect(afterFirst).toBeGreaterThanOrEqual(1)
      // Read again with no DOM mutation in between — should NOT emit.
      void div.offsetWidth
      expect(got).toHaveLength(afterFirst)
    } finally {
      collector.deactivate()
    }
  })

  it('emits when style write precedes layout read', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth // first dirty read
      const baseline = got.length
      div.style.width = '50px' // mutation
      void div.offsetWidth // should emit
      expect(got.length).toBeGreaterThan(baseline)
    } finally {
      collector.deactivate()
    }
  })

  it('handles MutationObserver absence gracefully', () => {
    const original = (globalThis as { MutationObserver?: unknown }).MutationObserver
    delete (globalThis as { MutationObserver?: unknown }).MutationObserver
    try {
      const collector = createForcedReflowCollector()
      const got: Signal[] = []
      // Falls back to over-report mode (Phase 1 behavior).
      expect(() => {
        collector.activate((s) => got.push(s))
        const div = document.createElement('div')
        document.body.appendChild(div)
        void div.offsetWidth
        collector.deactivate()
      }).not.toThrow()
    } finally {
      ;(globalThis as { MutationObserver?: unknown }).MutationObserver = original
    }
  })
})
```

- [ ] **Step 2: Run to verify the dirty-gating tests fail**

Run: `pnpm test packages/core/tests/collectors/forced-reflow.test.ts`
Expected: The first two new tests FAIL because the current collector always emits. The third (graceful absence) may already pass.

- [ ] **Step 3: Implement dirty tracking**

In `packages/core/src/collectors/forced-reflow.ts`, the closure-level state needs a MutationObserver. Make these changes:

Add a top-of-closure state variable in `createForcedReflowCollector`. Find the existing block:

```ts
export function createForcedReflowCollector(): Collector {
  let active = false
  let emit: (s: Signal) => void = () => {}
  const saved: SavedDescriptor[] = []
```

Replace with:

```ts
export function createForcedReflowCollector(): Collector {
  let active = false
  let emit: (s: Signal) => void = () => {}
  const saved: SavedDescriptor[] = []
  let mutationObserver: MutationObserver | null = null

  function consumePendingMutations(): boolean {
    if (!mutationObserver) {
      // Fallback when MutationObserver isn't available: always treat as dirty
      // (Phase 1 over-report behavior).
      return true
    }
    return mutationObserver.takeRecords().length > 0
  }
```

Then in `patchGetter`, the `if (active)` block becomes:

```ts
if (active) {
  if (!consumePendingMutations()) {
    return originalGet.call(this)
  }
  const at = performance.now()
  const rawStack = new Error().stack
  const value = originalGet.call(this)
  const duration = performance.now() - at
  const signal = { kind: 'forced-reflow' as const, at, duration } as unknown as Signal
  attachLazyStack(signal, rawStack)
  emit(signal)
  return value
}
```

Apply the same change in `patchMethod`'s `if (active)` block.

Now in `activate`, after `active = true`, create the observer:

Replace the `activate` body's existing patching loop section. Find:

```ts
activate(emitFn) {
  if (active) return
  emit = emitFn
  active = true

  if (typeof HTMLElement !== 'undefined') {
    for (const key of LAYOUT_GETTERS) {
      patchGetter(HTMLElement.prototype, key)
    }
  }
  if (typeof Element !== 'undefined') {
    for (const key of LAYOUT_METHODS) {
      patchMethod(Element.prototype, key)
    }
  }
},
```

Replace with:

```ts
activate(emitFn) {
  if (active) return
  emit = emitFn
  active = true

  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    try {
      mutationObserver = new MutationObserver(() => {})
      mutationObserver.observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      })
    } catch (err) {
      console.warn('[react-perfscope] forced-reflow MutationObserver failed:', err)
      mutationObserver = null
    }
  }

  if (typeof HTMLElement !== 'undefined') {
    for (const key of LAYOUT_GETTERS) {
      patchGetter(HTMLElement.prototype, key)
    }
  }
  if (typeof Element !== 'undefined') {
    for (const key of LAYOUT_METHODS) {
      patchMethod(Element.prototype, key)
    }
  }
},
```

In `deactivate`, disconnect the observer. Find:

```ts
deactivate() {
  if (!active) return
  active = false
  for (const { proto, key, descriptor } of saved) {
    Object.defineProperty(proto, key, descriptor)
  }
  saved.length = 0
},
```

Replace with:

```ts
deactivate() {
  if (!active) return
  active = false
  if (mutationObserver) {
    try {
      mutationObserver.disconnect()
    } catch {
      // ignore
    }
    mutationObserver = null
  }
  for (const { proto, key, descriptor } of saved) {
    Object.defineProperty(proto, key, descriptor)
  }
  saved.length = 0
},
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/collectors/forced-reflow.test.ts`
Expected: All 10 tests pass (6 original + 1 lazy-stack + 3 dirty-tracking).

Note: the test "emits forced-reflow signal when offsetWidth is read while active" remains valid because the initial `appendChild` is a DOM mutation that flips dirty true for the subsequent `offsetWidth` read.

If "does not emit when no DOM mutation occurred since last read" fails because happy-dom's MutationObserver doesn't queue records synchronously after `appendChild`, switch the test to use `setAttribute` for the explicit mutation step. Try first with `appendChild`; if that's flaky in happy-dom, use this alternative:

```ts
const div = document.createElement('div')
document.body.appendChild(div)
div.setAttribute('data-marker', '1') // explicit dirty
void div.offsetWidth
const afterFirst = got.length
expect(afterFirst).toBeGreaterThanOrEqual(1)
void div.offsetWidth // no mutation in between
expect(got).toHaveLength(afterFirst)
```

- [ ] **Step 5: Update README caveat**

In `packages/core/README.md`, replace the existing Phase 1 caveat paragraph with:

```
**Phase 2 update:** The forced-reflow collector now uses synchronous dirty tracking via `MutationObserver.takeRecords()` — it only emits when a DOM mutation occurred since the last layout read. Stack parsing is deferred until `signal.stack` is accessed, keeping per-signal cost low.
```

- [ ] **Step 6: Run full suite**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 44 tests pass (41 from before + 3 dirty-tracking), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/tests packages/core/README.md
git commit -m "feat(core): add dirty tracking to forced-reflow via takeRecords()"
```

---

## Task 5: Layout-shift collector

**Goal:** Wrap `PerformanceObserver({ type: 'layout-shift' })`. Each entry produces a `LayoutShiftSignal` carrying `value` and `sources` (DOMRect[] from `entry.sources[].currentRect`).

**Files:**
- Create: `packages/core/tests/collectors/layout-shift.test.ts`
- Create: `packages/core/src/collectors/layout-shift.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/collectors/layout-shift.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLayoutShiftCollector } from '../../src/collectors/layout-shift'
import type { LayoutShiftSignal, Signal } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void
let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {}
}

beforeEach(() => {
  observers = []
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})

afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

function fireShift(value: number, currentRects: DOMRect[]) {
  const sources = currentRects.map((rect) => ({ currentRect: rect, previousRect: rect, node: null }))
  const entry = {
    entryType: 'layout-shift',
    startTime: 100,
    duration: 0,
    name: '',
    value,
    hadRecentInput: false,
    sources,
  } as unknown as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'layout-shift' || opts.entryTypes?.includes('layout-shift')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('layout-shift collector', () => {
  it('registers PerformanceObserver for layout-shift', () => {
    const collector = createLayoutShiftCollector()
    collector.activate(() => {})
    expect(observers).toHaveLength(1)
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('layout-shift')
  })

  it('emits LayoutShiftSignal with value and sources', () => {
    const collector = createLayoutShiftCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    const rect = new DOMRect(10, 20, 100, 50)
    fireShift(0.07, [rect])
    expect(got).toHaveLength(1)
    const s = got[0] as LayoutShiftSignal
    expect(s.kind).toBe('layout-shift')
    expect(s.value).toBeCloseTo(0.07)
    expect(s.at).toBe(100)
    expect(s.sources).toHaveLength(1)
    expect(s.sources[0]).toEqual(rect)
  })

  it('skips entries marked hadRecentInput: true', () => {
    const collector = createLayoutShiftCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    const entry = {
      entryType: 'layout-shift',
      startTime: 50,
      duration: 0,
      name: '',
      value: 0.1,
      hadRecentInput: true,
      sources: [],
    } as unknown as PerformanceEntry
    for (const { cb } of observers) {
      cb({ getEntries: () => [entry] })
    }
    expect(got).toHaveLength(0)
  })

  it('disconnects on deactivate', () => {
    const collector = createLayoutShiftCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createLayoutShiftCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/core/tests/collectors/layout-shift.test.ts`
Expected: Module not found / 5 tests fail to collect.

- [ ] **Step 3: Implement layout-shift collector**

Create `packages/core/src/collectors/layout-shift.ts`:

```ts
import type { Collector, Signal } from '../types'

interface LayoutShiftEntryLike extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
  sources?: { currentRect: DOMRect }[]
}

export function createLayoutShiftCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'layout-shift',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; layout-shift disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const raw of list.getEntries()) {
            const entry = raw as LayoutShiftEntryLike
            if (entry.hadRecentInput) continue
            const sources = (entry.sources ?? []).map((s) => s.currentRect)
            emit({
              kind: 'layout-shift',
              at: entry.startTime,
              value: entry.value,
              sources,
            })
          }
        })
        observer.observe({ type: 'layout-shift', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] layout-shift collector failed to start:', err)
        observer = null
        active = false
      }
    },
    deactivate() {
      active = false
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          // ignore
        }
        observer = null
      }
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/core/tests/collectors/layout-shift.test.ts`
Expected: 5/5 pass.

- [ ] **Step 5: Re-export**

In `packages/core/src/index.ts`, add to the Collectors section:

```ts
export { createLayoutShiftCollector } from './collectors/layout-shift'
```

The Collectors section should now be:

```ts
// Collectors
export { createLongTasksCollector } from './collectors/long-tasks'
export { createForcedReflowCollector } from './collectors/forced-reflow'
export { createLayoutShiftCollector } from './collectors/layout-shift'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 49 tests pass (44 + 5), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add layout-shift collector"
```

---

## Task 6: Network collector

**Goal:** Wrap `PerformanceObserver({ type: 'resource' })`. Each `PerformanceResourceTiming` becomes a `NetworkSignal` with `url`, `startedAt`, `duration`, `size`, `blocking`.

A resource is considered "blocking" if `renderBlockingStatus === 'blocking'` (when available) or if its `initiatorType` indicates a render-blocking type (`script` without `async`/`defer` is hard to detect post-hoc — we fall back to checking `renderBlockingStatus`).

**Files:**
- Create: `packages/core/tests/collectors/network.test.ts`
- Create: `packages/core/src/collectors/network.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/collectors/network.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createNetworkCollector } from '../../src/collectors/network'
import type { NetworkSignal, Signal } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void
let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {}
}

beforeEach(() => {
  observers = []
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})

afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

function fireResource(partial: Partial<PerformanceResourceTiming> & { name: string }) {
  const entry = {
    entryType: 'resource',
    startTime: 100,
    duration: 200,
    transferSize: 1024,
    renderBlockingStatus: 'non-blocking',
    ...partial,
  } as unknown as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'resource' || opts.entryTypes?.includes('resource')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('network collector', () => {
  it('registers PerformanceObserver for resource', () => {
    const collector = createNetworkCollector()
    collector.activate(() => {})
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('resource')
  })

  it('emits NetworkSignal with url, startedAt, duration, size', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({ name: 'http://x/a.js', startTime: 50, duration: 120, transferSize: 8192 } as Partial<PerformanceResourceTiming> & { name: string })
    expect(got).toHaveLength(1)
    const s = got[0] as NetworkSignal
    expect(s.kind).toBe('network')
    expect(s.url).toBe('http://x/a.js')
    expect(s.startedAt).toBe(50)
    expect(s.duration).toBe(120)
    expect(s.size).toBe(8192)
    expect(s.blocking).toBe(false)
  })

  it('marks blocking: true when renderBlockingStatus is "blocking"', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({
      name: 'http://x/blocking.css',
      renderBlockingStatus: 'blocking',
    } as Partial<PerformanceResourceTiming> & { name: string })
    const s = got[0] as NetworkSignal
    expect(s.blocking).toBe(true)
  })

  it('falls back to 0 size when transferSize is missing', () => {
    const collector = createNetworkCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireResource({ name: 'http://x/cached.js', transferSize: 0 } as Partial<PerformanceResourceTiming> & { name: string })
    expect((got[0] as NetworkSignal).size).toBe(0)
  })

  it('disconnects on deactivate without throwing', () => {
    const collector = createNetworkCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createNetworkCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/core/tests/collectors/network.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement network collector**

Create `packages/core/src/collectors/network.ts`:

```ts
import type { Collector, Signal } from '../types'

interface ResourceTimingLike extends PerformanceEntry {
  transferSize?: number
  renderBlockingStatus?: 'blocking' | 'non-blocking'
}

export function createNetworkCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'network',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; network disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const raw of list.getEntries()) {
            const entry = raw as ResourceTimingLike
            emit({
              kind: 'network',
              url: entry.name,
              startedAt: entry.startTime,
              duration: entry.duration,
              size: entry.transferSize ?? 0,
              blocking: entry.renderBlockingStatus === 'blocking',
            })
          }
        })
        observer.observe({ type: 'resource', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] network collector failed to start:', err)
        observer = null
        active = false
      }
    },
    deactivate() {
      active = false
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          // ignore
        }
        observer = null
      }
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/core/tests/collectors/network.test.ts`
Expected: 6/6 pass.

- [ ] **Step 5: Re-export**

In `packages/core/src/index.ts`, append to Collectors section:

```ts
export { createNetworkCollector } from './collectors/network'
```

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 55 tests pass (49 + 6), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add network collector for resource timing"
```

---

## Task 7: Web-vitals collector

**Goal:** Wrap the official `web-vitals` library. Subscribes to each Web Vital (LCP, FID/INP, CLS, FCP, TTFB) and emits a `WebVitalSignal` per measurement.

**Files:**
- Modify: `packages/core/package.json` (add `web-vitals` dep)
- Create: `packages/core/tests/collectors/web-vitals.test.ts`
- Create: `packages/core/src/collectors/web-vitals.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add `web-vitals` dependency**

In `packages/core/package.json`, add `web-vitals` to the dependencies section:

```json
"dependencies": {
  "source-map": "^0.7.4",
  "web-vitals": "^4.0.0"
}
```

Then install:

```bash
pnpm install
```

Expected: `web-vitals` added to lockfile.

- [ ] **Step 2: Write failing tests with mocked web-vitals**

Create `packages/core/tests/collectors/web-vitals.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type WebVitalCb = (metric: { name: string; value: number }) => void

const subscribers: Record<string, WebVitalCb | undefined> = {}

vi.mock('web-vitals', () => ({
  onLCP: (cb: WebVitalCb) => {
    subscribers.LCP = cb
  },
  onINP: (cb: WebVitalCb) => {
    subscribers.INP = cb
  },
  onCLS: (cb: WebVitalCb) => {
    subscribers.CLS = cb
  },
  onFCP: (cb: WebVitalCb) => {
    subscribers.FCP = cb
  },
  onTTFB: (cb: WebVitalCb) => {
    subscribers.TTFB = cb
  },
}))

import { createWebVitalsCollector } from '../../src/collectors/web-vitals'
import type { Signal, WebVitalSignal } from '../../src/types'

beforeEach(() => {
  for (const key of Object.keys(subscribers)) {
    subscribers[key] = undefined
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('web-vitals collector', () => {
  it('subscribes to all 5 metrics on activate', () => {
    const collector = createWebVitalsCollector()
    collector.activate(() => {})
    expect(subscribers.LCP).toBeDefined()
    expect(subscribers.INP).toBeDefined()
    expect(subscribers.CLS).toBeDefined()
    expect(subscribers.FCP).toBeDefined()
    expect(subscribers.TTFB).toBeDefined()
  })

  it('emits WebVitalSignal for each fired metric', () => {
    const collector = createWebVitalsCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    subscribers.LCP!({ name: 'LCP', value: 2400 })
    subscribers.CLS!({ name: 'CLS', value: 0.05 })
    expect(got).toHaveLength(2)
    const lcp = got[0] as WebVitalSignal
    expect(lcp.kind).toBe('web-vital')
    expect(lcp.name).toBe('LCP')
    expect(lcp.value).toBe(2400)
  })

  it('does not emit after deactivate', () => {
    const collector = createWebVitalsCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    collector.deactivate()
    subscribers.LCP!({ name: 'LCP', value: 2400 })
    expect(got).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test packages/core/tests/collectors/web-vitals.test.ts`
Expected: Module not found / 3 tests fail.

- [ ] **Step 4: Implement web-vitals collector**

Create `packages/core/src/collectors/web-vitals.ts`:

```ts
import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'
import type { Collector, Signal, WebVitalSignal } from '../types'

type VitalName = WebVitalSignal['name']

export function createWebVitalsCollector(): Collector {
  let active = false
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
      if (active) return
      emit = emitFn
      active = true
      try {
        onLCP(makeHandler('LCP'))
        onINP(makeHandler('INP'))
        onCLS(makeHandler('CLS'))
        onFCP(makeHandler('FCP'))
        onTTFB(makeHandler('TTFB'))
      } catch (err) {
        console.warn('[react-perfscope] web-vitals collector failed to subscribe:', err)
        active = false
      }
    },
    deactivate() {
      // The web-vitals library does not expose unsubscribe; the `active` flag
      // gates emission in the handlers themselves.
      active = false
    },
  }
}
```

(Note: `FID` from the spec's union was replaced by `INP` as web-vitals v4 dropped FID. The Signal type still accepts both literals; `FID` is left for forward/backward compat but we don't subscribe to it. If you want explicit clarity, add a comment in the WebVitalSignal type — but don't change the type in Phase 2.)

- [ ] **Step 5: Run tests**

Run: `pnpm test packages/core/tests/collectors/web-vitals.test.ts`
Expected: 3/3 pass.

- [ ] **Step 6: Re-export**

In `packages/core/src/index.ts`, append to Collectors section:

```ts
export { createWebVitalsCollector } from './collectors/web-vitals'
```

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 58 tests pass (55 + 3), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src packages/core/tests packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add web-vitals collector"
```

---

## Task 8: Paint collector

**Goal:** Wrap `PerformanceObserver({ type: 'paint' })` for first-paint and first-contentful-paint events. Also expose a `MutationObserver`-driven path for paint regions (DOM regions that mutated, used by the UI to overlay). For Phase 2 simplicity, emit a `PaintSignal` for each paint entry with `rect` = `new DOMRect(0, 0, 0, 0)` placeholder and `cause: 'unknown'`. Phase 3 will extend with actual mutated regions.

**Phase 2 caveat for paint:** The `rect` field is set to a zero-sized DOMRect because the `paint` entry type doesn't carry geometric info. The UI overlay use of paint regions will be added in Phase 3 alongside the UI package. Document this in the package README.

**Files:**
- Create: `packages/core/tests/collectors/paint.test.ts`
- Create: `packages/core/src/collectors/paint.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/README.md`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/collectors/paint.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPaintCollector } from '../../src/collectors/paint'
import type { PaintSignal, Signal } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void
let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {}
}

beforeEach(() => {
  observers = []
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})

afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

function firePaint(name: string, startTime: number) {
  const entry = { entryType: 'paint', name, startTime, duration: 0 } as PerformanceEntry
  for (const { cb, opts } of observers) {
    if (opts.type === 'paint' || opts.entryTypes?.includes('paint')) {
      cb({ getEntries: () => [entry] })
    }
  }
}

describe('paint collector', () => {
  it('registers PerformanceObserver for paint', () => {
    const collector = createPaintCollector()
    collector.activate(() => {})
    const observed = observers[0]!.opts.type ?? observers[0]!.opts.entryTypes?.[0]
    expect(observed).toBe('paint')
  })

  it('emits PaintSignal with at timestamp and zero rect placeholder', () => {
    const collector = createPaintCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    firePaint('first-paint', 150)
    expect(got).toHaveLength(1)
    const s = got[0] as PaintSignal
    expect(s.kind).toBe('paint')
    expect(s.at).toBe(150)
    expect(s.cause).toBe('unknown')
    expect(s.rect.width).toBe(0)
    expect(s.rect.height).toBe(0)
  })

  it('disconnects on deactivate without throwing', () => {
    const collector = createPaintCollector()
    collector.activate(() => {})
    expect(() => collector.deactivate()).not.toThrow()
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createPaintCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/core/tests/collectors/paint.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement paint collector**

Create `packages/core/src/collectors/paint.ts`:

```ts
import type { Collector, Signal } from '../types'

export function createPaintCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'paint',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; paint disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const entry of list.getEntries()) {
            emit({
              kind: 'paint',
              at: entry.startTime,
              rect: new DOMRect(0, 0, 0, 0),
              cause: 'unknown',
            })
          }
        })
        observer.observe({ type: 'paint', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] paint collector failed to start:', err)
        observer = null
        active = false
      }
    },
    deactivate() {
      active = false
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          // ignore
        }
        observer = null
      }
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/core/tests/collectors/paint.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Re-export**

In `packages/core/src/index.ts`, append to Collectors section:

```ts
export { createPaintCollector } from './collectors/paint'
```

- [ ] **Step 6: Update README to note paint caveat**

In `packages/core/README.md`, after the existing Phase 2 caveat paragraph, append:

```
**Paint collector caveat:** Phase 2 emits paint entries with a zero-sized `rect` placeholder. Real mutated-region geometry arrives with the UI package in Phase 3, which will pair paint events with MutationObserver records to compute affected regions.
```

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm test && pnpm --filter @react-perfscope/core typecheck`
Expected: 62 tests pass (58 + 4), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src packages/core/tests packages/core/README.md
git commit -m "feat(core): add paint collector (rect placeholder, Phase 3 will enrich)"
```

---

## Task 9: Final API consolidation + README + build verification

**Goal:** Make sure all new collectors are exported, update the README example to use all four new collectors, run full verification.

**Files:**
- Modify: `packages/core/src/index.ts` (sanity check, no new exports beyond previous tasks)
- Modify: `packages/core/README.md`

- [ ] **Step 1: Verify final `packages/core/src/index.ts`**

Open `packages/core/src/index.ts` and confirm it reads exactly as:

```ts
// Types
export * from './types'

// Recorder
export { createRecorder } from './recorder'

// Sourcemap utilities
export { parseStack, resolveFrame, attachLazyStack } from './sourcemap'
export type { FetchMap } from './sourcemap'

// Collectors
export { createLongTasksCollector } from './collectors/long-tasks'
export { createForcedReflowCollector } from './collectors/forced-reflow'
export { createLayoutShiftCollector } from './collectors/layout-shift'
export { createNetworkCollector } from './collectors/network'
export { createWebVitalsCollector } from './collectors/web-vitals'
export { createPaintCollector } from './collectors/paint'
```

If anything differs, adjust to match. Do not export `InternalRecorder`.

- [ ] **Step 2: Rewrite `packages/core/README.md` end-to-end**

Replace the entire contents of `packages/core/README.md` with the literal content between the `~~~markdown` fences below (do not include the `~~~` markers themselves in the file):

~~~markdown
# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals.

## Status

Phase 2 complete — `@react-perfscope/core` ships all 6 core collectors (forced-reflow, long-tasks, layout-shift, network, web-vitals, paint) with deferred stack parsing and synchronous dirty tracking on forced-reflow.

**Forced-reflow note:** Synchronous dirty tracking via `MutationObserver.takeRecords()` ensures the collector only emits when DOM mutated since the last layout read. Stack parsing is deferred until `signal.stack` is accessed.

**Paint collector note:** Phase 2 emits paint entries with a zero-sized `rect` placeholder. Real mutated-region geometry arrives with the UI package in Phase 3.

The `render` signal is owned by the upcoming `@react-perfscope/react` package (Phase 3) and not yet emitted.

## Example

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createPaintCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createForcedReflowCollector())
recorder.use(createLongTasksCollector())
recorder.use(createLayoutShiftCollector())
recorder.use(createNetworkCollector())
recorder.use(createWebVitalsCollector())
recorder.use(createPaintCollector())

recorder.start()
// ... user interaction ...
const result = recorder.stop()

console.log(result.signals)
```
~~~

The file ends after the closing ts code fence. No trailing content.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @react-perfscope/core typecheck`
Expected: No errors.

- [ ] **Step 4: Build**

Run: `pnpm --filter @react-perfscope/core build`
Expected: `dist/` contains `index.js`, `.cjs`, `.d.ts`, `.d.cts`, `.js.map`, `.cjs.map`. No build errors.

- [ ] **Step 5: Inspect public API surface**

Run: `grep -E '^(export|declare)' packages/core/dist/index.d.ts | head -40`

Expected: Public exports include `createRecorder`, all 6 `create*Collector` factories, `parseStack`, `resolveFrame`, `attachLazyStack`, and the `Signal`/subtype/`Recorder`/`Collector`/`StackFrame`/`RecordingResult`/`FetchMap` types. **`InternalRecorder` must NOT appear.**

Verify: `grep InternalRecorder packages/core/dist/index.d.ts`
Expected: no matches.

- [ ] **Step 6: Full test run**

Run: `pnpm test`
Expected: All 62 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/README.md
git commit -m "feat(core): finalize Phase 2 exports and README"
```

---

## Phase 2 Acceptance Criteria

After all 9 tasks complete:

- [ ] On branch `phase-2-core-complete`
- [ ] `pnpm test` passes 100% (62 tests)
- [ ] `pnpm --filter @react-perfscope/core typecheck` clean
- [ ] `pnpm --filter @react-perfscope/core build` produces `dist/`
- [ ] `dist/index.d.ts` does NOT export `InternalRecorder` or `__push`
- [ ] `dist/index.d.ts` DOES export: `createRecorder`, `createForcedReflowCollector`, `createLongTasksCollector`, `createLayoutShiftCollector`, `createNetworkCollector`, `createWebVitalsCollector`, `createPaintCollector`, `parseStack`, `resolveFrame`, `attachLazyStack`, plus all types
- [ ] `Recorder.use()` is part of the public `Recorder` interface
- [ ] Forced-reflow collector: dirty tracking gated by `MutationObserver.takeRecords()`, stack parsing deferred
- [ ] All 6 collectors function (signal emission, deactivate cleanup, graceful no-op when API absent)

## Next Phase Preview (Phase 3)

- `@react-perfscope/react` package: fiber walker via `__REACT_DEVTOOLS_GLOBAL_HOOK__`, render-collector, element→component attribution
- Extend paint collector with mutated-region geometry (paired with MutationObserver records from the react adapter, or core-side)
- Optional Phase 3 cleanups carried over from Phase 1 follow-ups: ring-buffer for the 10k cap, `SourceMapConsumer` cache in `resolveFrame`
