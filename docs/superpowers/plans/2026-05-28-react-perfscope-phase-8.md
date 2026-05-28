# react-perfscope Phase 8 — Source-map resolution + export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make captured stack frames actually readable. Today the Panel shows raw bundle URLs like `react-perfscope_auto.js?v=4b987d0a:2552:28` — useless for debugging the user's own code. Phase 8 fetches source maps from the dev server and resolves frames to original source positions (e.g. `packages/ui/src/shadow-mount.ts:9:5` or user-app `src/App.tsx:14:7`).

Also adds an export button so users can save the recording (JSON) for later inspection or sharing.

**Out of scope (Phase 9+):** timeline view, light theme, layout-shift node identification.

**Architecture:**
- New `@react-perfscope/core` helper: `createSourceMapResolver()` returns a `{ resolve(frame): Promise<StackFrame> }` that fetches `.map` files lazily and caches `SourceMapConsumer` instances per source file URL.
- Resolver is provided by the meta/auto bootstrap to the UI via a small context. Panel calls it on demand when a row is expanded — UNRESOLVED frames are rendered initially, then re-rendered with resolved values as the promise settles.
- Export feature: a "Save" button in the Panel header generates a JSON blob from the current `RecordingResult` and triggers a download via `URL.createObjectURL`.

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-8-sourcemap-export`.

---

## Task 1: SourceMap resolver with caching (core)

**Goal:** A reusable resolver that lazily fetches `.map` files for a given source URL, caches the `SourceMapConsumer` per URL, and resolves a `StackFrame` to its original position.

The resolver lives in `@react-perfscope/core`. It uses the existing `resolveFrame` helper plus a fetch-based `FetchMap`.

**Files:**
- Modify: `packages/core/src/sourcemap.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/sourcemap-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/sourcemap-resolver.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSourceMapResolver } from '../src/sourcemap'

const TEST_MAP = {
  version: 3 as const,
  sources: ['original.ts'],
  names: ['doWork'],
  mappings: 'AAIEA', // line 5, col 2 (1-indexed line 5)
  file: 'bundled.js',
}

describe('createSourceMapResolver', () => {
  it('fetches the source map referenced by //# sourceMappingURL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/bundled.js') {
        return new Response(`console.log(1);\n//# sourceMappingURL=bundled.js.map`)
      }
      if (url === 'http://x/bundled.js.map') {
        return new Response(JSON.stringify(TEST_MAP))
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const resolved = await resolver.resolve({
      file: 'http://x/bundled.js',
      line: 1,
      col: 4,
      fnName: 'doWork',
    })
    expect(resolved.file).toBe('original.ts')
    expect(resolved.line).toBe(5)
    expect(resolved.col).toBe(2)
  })

  it('falls back to the original frame when no sourceMappingURL is present', async () => {
    const fetchMock = vi.fn(async () => new Response(`console.log(1);\n// no sourcemap`))
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/plain.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })

  it('falls back to the original frame when the .map fetch 404s', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/missing.js') {
        return new Response(`code\n//# sourceMappingURL=missing.js.map`)
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/missing.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })

  it('reuses the cached consumer on repeated resolves for the same file', async () => {
    let mapFetches = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/cached.js') {
        return new Response(`code\n//# sourceMappingURL=cached.js.map`)
      }
      if (url === 'http://x/cached.js.map') {
        mapFetches++
        return new Response(JSON.stringify(TEST_MAP))
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    await resolver.resolve({ file: 'http://x/cached.js', line: 1, col: 4 })
    await resolver.resolve({ file: 'http://x/cached.js', line: 1, col: 4 })
    expect(mapFetches).toBe(1)
  })

  it('handles inline data: URI source maps', async () => {
    const inlineJson = JSON.stringify(TEST_MAP)
    // base64 of TEST_MAP
    const base64 = Buffer.from(inlineJson).toString('base64')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/inline.js') {
        return new Response(
          `code\n//# sourceMappingURL=data:application/json;base64,${base64}`
        )
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const resolved = await resolver.resolve({ file: 'http://x/inline.js', line: 1, col: 4 })
    expect(resolved.file).toBe('original.ts')
  })

  it('returns the original frame when fetch throws (network error)', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down') })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/oops.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/core/tests/sourcemap-resolver.test.ts`
Expected: 6 tests fail (`createSourceMapResolver` doesn't exist).

- [ ] **Step 3: Implement the resolver**

Append to `packages/core/src/sourcemap.ts`:

```ts
export interface SourceMapResolver {
  /** Resolve a parsed StackFrame to its original source position. Falls back to the input frame on any failure. */
  resolve(frame: StackFrame): Promise<StackFrame>
}

export interface CreateSourceMapResolverOptions {
  /** Override the global fetch. Useful for tests and non-browser environments. */
  fetch?: typeof globalThis.fetch
}

/**
 * Create a SourceMap resolver that fetches `.map` files from the live URL
 * referenced in each source file's `//# sourceMappingURL=` directive.
 * Caches the parsed source map per source URL so repeated resolves against
 * the same file are O(1) after the first.
 *
 * Returns the input frame on any failure (network error, missing map, etc.).
 */
export function createSourceMapResolver(opts: CreateSourceMapResolverOptions = {}): SourceMapResolver {
  const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null)
  const cache = new Map<string, Promise<RawSourceMap | null>>()

  function fetchMapFor(sourceUrl: string): Promise<RawSourceMap | null> {
    if (!f) return Promise.resolve(null)
    const existing = cache.get(sourceUrl)
    if (existing) return existing
    const promise = (async () => {
      try {
        const res = await f(sourceUrl)
        if (!res || !res.ok) return null
        const text = await res.text()
        const m = text.match(/\/\/[#@]\s*sourceMappingURL=(.+?)\s*$/m)
        if (!m) return null
        const ref = m[1]!.trim()
        if (ref.startsWith('data:')) {
          // data:application/json;base64,... or data:application/json,...
          const commaIdx = ref.indexOf(',')
          if (commaIdx === -1) return null
          const header = ref.slice(0, commaIdx)
          const payload = ref.slice(commaIdx + 1)
          const decoded = header.includes('base64')
            ? typeof atob === 'function'
              ? atob(payload)
              : Buffer.from(payload, 'base64').toString('utf8')
            : decodeURIComponent(payload)
          return JSON.parse(decoded) as RawSourceMap
        }
        const mapUrl = new URL(ref, sourceUrl).href
        const mapRes = await f(mapUrl)
        if (!mapRes || !mapRes.ok) return null
        return (await mapRes.json()) as RawSourceMap
      } catch {
        return null
      }
    })()
    cache.set(sourceUrl, promise)
    return promise
  }

  return {
    async resolve(frame) {
      try {
        return await resolveFrame(frame, fetchMapFor)
      } catch {
        return frame
      }
    },
  }
}
```

- [ ] **Step 4: Re-export from index**

In `packages/core/src/index.ts`, find the sourcemap exports section and add `createSourceMapResolver` + its types:

```ts
// Sourcemap utilities
export { parseStack, resolveFrame, attachLazyStack, createSourceMapResolver } from './sourcemap'
export type { FetchMap, SourceMapResolver, CreateSourceMapResolverOptions } from './sourcemap'
```

- [ ] **Step 5: Run tests**

Run: `pnpm test packages/core/tests/sourcemap-resolver.test.ts`
Expected: 6/6 pass.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 154 tests pass (148 + 6), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): createSourceMapResolver with fetch + cache + data-URI support"
```

---

## Task 2: Apply source-map resolution to forced-reflow stack frames in the Panel

**Goal:** When a forced-reflow row is expanded, fetch source maps and replace the raw bundle URLs with resolved source positions. While the promise is in flight, show the original frame with a subtle "resolving..." indicator.

**Files:**
- Modify: `packages/ui/src/types.ts` (add `resolveFrame?` callback to MountOptions)
- Modify: `packages/ui/src/mount.tsx` (pass through to App/Panel)
- Modify: `packages/ui/src/app.tsx`
- Modify: `packages/ui/src/panel.tsx`
- Modify: `packages/meta/src/auto.ts` (create resolver, pass to mount)
- Modify: `packages/ui/tests/panel.test.tsx`

- [ ] **Step 1: Add resolveFrame plumbing to UI types**

In `packages/ui/src/types.ts`, find the existing `MountOptions` interface and add the new field:

```ts
import type { Recorder, StackFrame } from '@react-perfscope/core'

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
  /**
   * Optional async resolver that maps a captured StackFrame to its original
   * source position. The Panel uses this when expanding a row with stack data.
   * Defaults to a no-op if not provided.
   */
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}

export type UnmountFn = () => void
```

- [ ] **Step 2: Thread resolveFrame from mount → App → Panel**

In `packages/ui/src/mount.tsx`, pass the option through:

```tsx
import { h } from 'preact'
import { App } from './app'
import { mountShadow } from './shadow-mount'
import type { MountOptions, UnmountFn } from './types'

export function mount(opts: MountOptions): UnmountFn {
  const { recorder, position = 'bottom-right', host = document.body, resolveFrame } = opts
  return mountShadow(
    <App recorder={recorder} position={position} resolveFrame={resolveFrame} />,
    { parent: host }
  )
}
```

In `packages/ui/src/app.tsx`, find the `AppProps` interface and add `resolveFrame`:

```tsx
import { h } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { Recorder, RecordingResult, StackFrame } from '@react-perfscope/core'
import { Widget } from './widget'
import { Panel } from './panel'
import type { WidgetPosition } from './types'

export interface AppProps {
  recorder: Recorder
  position?: WidgetPosition
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}
```

Then in `App`'s destructuring and Panel render:

```tsx
export function App(props: AppProps) {
  const { recorder, position = 'bottom-right', resolveFrame } = props
  // ... existing state ...
  // ... existing onToggle / onClose ...

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
        <Panel result={result} position={position} onClose={onClose} resolveFrame={resolveFrame} />
      )}
    </>
  )
}
```

- [ ] **Step 3: Use the resolver in the Panel**

In `packages/ui/src/panel.tsx`, add `resolveFrame` to `PanelProps`:

```tsx
import type {
  RecordingResult,
  Signal,
  SignalKind,
  StackFrame,
  ForcedReflowSignal,
  // ... (existing imports)
} from '@react-perfscope/core'

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}
```

Replace `ForcedReflowDetail` to take a resolver prop and resolve frames asynchronously:

```tsx
function ForcedReflowDetail({
  s,
  resolveFrame,
}: {
  s: ForcedReflowSignal
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  const original = s.stack.slice(0, 8)
  const [frames, setFrames] = useState<StackFrame[]>(original)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!resolveFrame || original.length === 0) return
    let cancelled = false
    setResolving(true)
    Promise.all(original.map((f) => resolveFrame(f)))
      .then((resolved) => {
        if (!cancelled) setFrames(resolved)
      })
      .catch(() => {/* ignore — keep originals */})
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => { cancelled = true }
  }, [s])

  return (
    <div style={{ paddingLeft: '12px' }}>
      {resolving && (
        <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>
          resolving source maps…
        </div>
      )}
      {frames.length === 0 ? (
        <div style={{ color: '#666' }}>No stack captured.</div>
      ) : (
        frames.map((f, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            {f.fnName ? <span>{f.fnName}</span> : <span style={{ color: '#666' }}>(anonymous)</span>}
            <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
          </div>
        ))
      )}
    </div>
  )
}
```

Apply the same pattern to `LongTaskDetail`'s embedded stack section (factor the stack rendering into a shared `<StackFrames>` component to avoid duplication):

```tsx
function StackFrames({
  raw,
  resolveFrame,
  limit = 8,
}: {
  raw: StackFrame[]
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
  limit?: number
}) {
  const original = raw.slice(0, limit)
  const [frames, setFrames] = useState<StackFrame[]>(original)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!resolveFrame || original.length === 0) return
    let cancelled = false
    setResolving(true)
    Promise.all(original.map((f) => resolveFrame(f)))
      .then((resolved) => {
        if (!cancelled) setFrames(resolved)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => { cancelled = true }
  }, [raw])

  return (
    <>
      {resolving && (
        <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>
          resolving source maps…
        </div>
      )}
      {frames.length === 0 ? (
        <div style={{ color: '#666' }}>No stack captured.</div>
      ) : (
        frames.map((f, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            {f.fnName ? <span>{f.fnName}</span> : <span style={{ color: '#666' }}>(anonymous)</span>}
            <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
          </div>
        ))
      )}
    </>
  )
}
```

Then `ForcedReflowDetail` becomes:

```tsx
function ForcedReflowDetail({
  s,
  resolveFrame,
}: {
  s: ForcedReflowSignal
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <StackFrames raw={s.stack} resolveFrame={resolveFrame} />
    </div>
  )
}
```

And `LongTaskDetail` (drop the inline stack rendering, use `<StackFrames>`):

```tsx
function LongTaskDetail({ s, resolveFrame }: { s: LongTaskSignal; resolveFrame?: (frame: StackFrame) => Promise<StackFrame> }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>started</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>ended</span><span>{(s.at + s.duration).toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(2)}ms</span></div>
      {s.stack.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <StackFrames raw={s.stack} resolveFrame={resolveFrame} limit={5} />
        </div>
      )}
    </div>
  )
}
```

Update `SignalDetail` to thread `resolveFrame` through:

```tsx
function SignalDetail({ s, resolveFrame }: { s: Signal; resolveFrame?: (frame: StackFrame) => Promise<StackFrame> }) {
  switch (s.kind) {
    case 'forced-reflow': return <ForcedReflowDetail s={s} resolveFrame={resolveFrame} />
    case 'layout-shift': return <LayoutShiftDetail s={s} />
    case 'long-task': return <LongTaskDetail s={s} resolveFrame={resolveFrame} />
    case 'network': return <NetworkDetail s={s} />
    case 'paint': return <PaintDetail s={s} />
    case 'web-vital': return <WebVitalDetail s={s} />
    case 'render': return <RenderDetail s={s} />
  }
}
```

And `SignalRow` to accept + pass `resolveFrame`:

```tsx
interface SignalRowProps {
  signal: Signal
  expanded: boolean
  onToggleExpand: () => void
  onHoverGeometry: (rects: DOMRect[] | null) => void
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}

function SignalRow({ signal, expanded, onToggleExpand, onHoverGeometry, resolveFrame }: SignalRowProps) {
  // ... existing structure ...
  // In the expanded branch:
  {expanded && (
    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a' }}>
      <SignalDetail s={signal} resolveFrame={resolveFrame} />
    </div>
  )}
}
```

And `Panel` passes `resolveFrame` to each `SignalRow`:

```tsx
<SignalRow
  key={key}
  signal={s}
  expanded={expandedKey === key}
  onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
  onHoverGeometry={handleHover}
  resolveFrame={resolveFrame}
/>
```

Also the grouping path with the `<div>` of children uses `<SummaryLine>`. Leave that as-is for now — grouped detail doesn't expand individual frames.

(Find the existing `useRef` import and ensure `useEffect` is imported alongside it.)

- [ ] **Step 4: Wire up the resolver in `auto.ts`**

In `packages/meta/src/auto.ts`, import `createSourceMapResolver` and pass to `mount`:

```ts
import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createPaintCollector,
  createSourceMapResolver,
} from '@react-perfscope/core'
import { createRenderCollector, installDevToolsHook } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

// ... inside bootstrap() ...
    const recorder = createRecorder()
    recorder.use(createForcedReflowCollector())
    recorder.use(createLongTasksCollector())
    recorder.use(createLayoutShiftCollector())
    recorder.use(createNetworkCollector())
    recorder.use(createWebVitalsCollector())
    recorder.use(createPaintCollector())
    recorder.use(createRenderCollector())

    const resolver = createSourceMapResolver()
    mount({ recorder, resolveFrame: (f) => resolver.resolve(f) })
```

- [ ] **Step 5: Add a Panel test for resolver invocation**

Append to `packages/ui/tests/panel.test.tsx`:

```tsx
describe('Panel source-map resolution', () => {
  it('invokes resolveFrame for each stack frame when forced-reflow row is expanded', async () => {
    const resolveFrame = vi.fn(async (f) => ({ ...f, file: 'resolved.ts' }))
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [
        { file: 'bundle.js', line: 1, col: 1, fnName: 'a' },
        { file: 'bundle.js', line: 2, col: 1, fnName: 'b' },
      ]},
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} resolveFrame={resolveFrame} />)
    fireEvent.click(container.querySelector('li')!)
    await new Promise((r) => setTimeout(r, 30))
    expect(resolveFrame).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('resolved.ts')
    cleanup()
  })

  it('falls back to original frames when no resolver provided', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [
        { file: 'bundle.js', line: 1, col: 1, fnName: 'a' },
      ]},
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    fireEvent.click(container.querySelector('li')!)
    expect(container.textContent).toContain('bundle.js')
    cleanup()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: 156 tests pass (154 + 2 new), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src packages/ui/tests packages/meta/src
git commit -m "feat(ui): resolve stack frames via source maps when expanding rows"
```

---

## Task 3: Export recording to JSON

**Goal:** A "Save" button in the Panel header that downloads the current `RecordingResult` as a JSON file. Useful for sharing reproductions, opening later for offline inspection, etc.

**Files:**
- Modify: `packages/ui/src/panel.tsx` (add Save button + download handler)
- Modify: `packages/ui/tests/panel.test.tsx`

- [ ] **Step 1: Add tests**

Append to `packages/ui/tests/panel.test.tsx`:

```tsx
describe('Panel export', () => {
  it('renders a Save button in the header', () => {
    const result = makeResult([])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.getByLabelText(/save recording/i)).toBeTruthy()
    cleanup()
  })

  it('triggers a JSON download with the recording data when Save is clicked', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'X', reason: 'commit', duration: 1 },
    ])
    const createObjectURLSpy = vi.fn(() => 'blob:fake')
    const revokeSpy = vi.fn()
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    ;(URL as { createObjectURL: typeof URL.createObjectURL }).createObjectURL = createObjectURLSpy as never
    ;(URL as { revokeObjectURL: typeof URL.revokeObjectURL }).revokeObjectURL = revokeSpy as never
    try {
      render(<Panel result={result} onClose={() => {}} />)
      fireEvent.click(screen.getByLabelText(/save recording/i))
      expect(createObjectURLSpy).toHaveBeenCalledOnce()
      const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
      expect(blob.type).toBe('application/json')
    } finally {
      ;(URL as { createObjectURL: typeof URL.createObjectURL }).createObjectURL = originalCreate
      ;(URL as { revokeObjectURL: typeof URL.revokeObjectURL }).revokeObjectURL = originalRevoke
      cleanup()
    }
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 2 new tests fail.

- [ ] **Step 3: Implement the Save button**

In `packages/ui/src/panel.tsx`, find the `<header>` block in the `Panel` component:

```tsx
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>react-perfscope</strong>
        <button type="button" aria-label="Close panel" onClick={onClose}
          style={{ background: 'transparent', color: '#e6e6e6', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
          ×
        </button>
      </header>
```

Replace with:

```tsx
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>react-perfscope</strong>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            aria-label="Save recording"
            onClick={() => downloadRecording(result)}
            title="Save recording"
            style={{
              background: 'transparent',
              color: '#e6e6e6',
              border: '1px solid #2a2a2a',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '2px 6px',
            }}
          >
            Save
          </button>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            style={{ background: 'transparent', color: '#e6e6e6', border: 'none', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      </header>
```

Then add the `downloadRecording` helper BEFORE the `Panel` function definition (after the `groupSignals` function or wherever fits):

```tsx
function downloadRecording(result: RecordingResult): void {
  // Materialise lazy `stack` getters on each signal so JSON.stringify includes them.
  const exportable = {
    ...result,
    signals: result.signals.map((s) => {
      if (s.kind === 'forced-reflow' || s.kind === 'long-task') {
        return { ...s, stack: s.stack }
      }
      return s
    }),
  }
  const json = JSON.stringify(exportable, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `react-perfscope-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // Small delay before revoke so the click handler completes.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
```

The `result.signals.map` is necessary because forced-reflow and long-task signals have a lazy `stack` getter; spreading them once materialises the array so JSON serialisation gets the data.

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: All pass (was 156, +2 = 158).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 158 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/panel.tsx packages/ui/tests/panel.test.tsx
git commit -m "feat(ui): Save button exports recording as JSON download"
```

---

## Task 4: README + final verification

**Files:**
- Modify: `packages/ui/README.md`
- Modify: `packages/core/README.md`

- [ ] **Step 1: Update `packages/ui/README.md`**

In the existing "What's in the panel" section (English side), append a paragraph after the "render" bullet:

```markdown
The header has a **Save** button that downloads the full recording as JSON. Stack frames inside the panel are passed through the optional `resolveFrame` mount option — when provided (the meta-package `auto` entry wires one up against the live dev server's source maps), bundle URLs like `bundle.js?v=abc:2552:28` become real source positions like `src/App.tsx:132:15`.
```

And the same for Korean side after the "render" bullet:

```markdown
헤더에는 **Save** 버튼이 있어서 전체 recording을 JSON으로 다운로드 받을 수 있다. 패널의 스택 프레임은 `resolveFrame` mount 옵션을 거치는데, 이게 제공되면 (meta 패키지의 `auto` entry가 자동으로 dev 서버의 source map에 대해 연결해줌) `bundle.js?v=abc:2552:28` 같은 번들 URL이 `src/App.tsx:132:15` 같은 실제 소스 위치로 변환된다.
```

- [ ] **Step 2: Update `packages/core/README.md`**

Add a short section after the Status section (English):

```markdown
## Source-map resolution

`createSourceMapResolver()` returns an async resolver that follows `//# sourceMappingURL=` references (including inline data URIs), caches the parsed source map per source URL, and resolves a `StackFrame` to its original source position. The UI uses this to make bundled stack traces readable.

```ts
import { createSourceMapResolver } from '@react-perfscope/core'

const resolver = createSourceMapResolver()
const original = await resolver.resolve(parsedFrame)
```

Falls back to the input frame on any failure (missing source map, network error, etc.).
```

And add the same in Korean (after 상태 section):

```markdown
## Source-map 해석

`createSourceMapResolver()`는 `//# sourceMappingURL=` 참조 (inline data URI 포함)를 따라가서 source map을 가져오고, 파싱된 결과를 소스 URL 단위로 캐시한 다음, `StackFrame`을 원본 소스 위치로 해석해주는 async resolver를 반환한다. UI에서 번들된 스택 트레이스를 읽을 수 있게 해주는 데 쓰인다.

```ts
import { createSourceMapResolver } from '@react-perfscope/core'

const resolver = createSourceMapResolver()
const original = await resolver.resolve(parsedFrame)
```

source map이 없거나 네트워크 에러 등 어떤 이유로든 실패하면 원본 frame을 그대로 반환한다.
```

- [ ] **Step 3: Final verification**

Run: `pnpm test`
Expected: 158/158 pass.

Run: `pnpm typecheck`
Expected: All 6 packages clean.

Run: `pnpm build`
Expected: All builds succeed.

Run: `head -3 packages/core/dist/index.d.ts && head -3 packages/ui/dist/index.d.ts && head -3 packages/meta/dist/auto.d.ts`
Expected: Every d.ts file starts with the `/// <reference lib="es2015" />` + `dom` banner.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/README.md packages/core/README.md
git commit -m "docs: document source-map resolution and Save export"
```

---

## Phase 8 Acceptance Criteria

After all 4 tasks complete:

- [ ] On branch `phase-8-sourcemap-export`
- [ ] `pnpm test` passes 100% (158 tests; +10 over Phase 7)
- [ ] `pnpm typecheck` clean across all 6 packages
- [ ] `pnpm build` produces dist for all 6 packages with lib refs
- [ ] `createSourceMapResolver()` exists in core; handles file://, inline data:, fetch errors gracefully
- [ ] Panel forced-reflow + long-task detail views resolve frames via the provided resolver
- [ ] Meta-package auto bootstrap wires up a default resolver against `fetch`
- [ ] Panel header has a Save button that downloads the recording as JSON

## Next Phase Preview (Phase 9+)

- Timeline view: stacked bar chart of all signals along the recording window
- Light theme toggle
- Layout-shift node identification (resolve source DOMRects to actual elements)
- Bundle size budgets + CI workflow (GitHub Actions)
- Real react-dom integration test in `@react-perfscope/react`
- changeset-based release automation
