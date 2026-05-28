# react-perfscope Phase 1 — Foundation + Core Recording Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up pnpm monorepo and ship `@react-perfscope/core` with a Recorder, sourcemap resolution, and two working collectors (forced-reflow, long-tasks).

**Architecture:** Monorepo via pnpm workspace. Single package (`packages/core`) in Phase 1, built with tsup, tested with vitest + happy-dom. Recorder is a buffer-based state machine; collectors register on start, deactivate on stop. All signals normalized to one `Signal` union type.

**Tech Stack:** pnpm 8+, TypeScript 5+, tsup, vitest, happy-dom, `source-map` library.

**Working Directory:** All paths are relative to `/Users/ray/workspace/react-perfscope`.

---

## Task 1: Initialize pnpm workspace + root tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `README.md`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules
dist
.DS_Store
*.log
coverage
.turbo
.tsbuildinfo
*.tsbuildinfo
```

- [ ] **Step 2: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "react-perfscope-monorepo",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@8.15.0",
  "scripts": {
    "build": "pnpm -r --filter=./packages/* build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r --filter=./packages/* typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "happy-dom": "^14.0.0",
    "tsup": "^8.0.0"
  }
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['packages/*/tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Create minimal `README.md`**

```markdown
# react-perfscope

Performance debugging tool for React 18+ apps. Records and visualizes forced reflows, layout shifts, long tasks, paint regions, web vitals, network waterfall, and React component re-renders during development.

See `docs/superpowers/specs/` for design documents.

## Status

Phase 1 in progress — core recording engine.
```

- [ ] **Step 8: Install dependencies**

Run: `pnpm install`
Expected: Creates `pnpm-lock.yaml`, installs into `node_modules`.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore .npmrc README.md pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace with root tooling"
```

---

## Task 2: Scaffold `@react-perfscope/core` package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@react-perfscope/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "source-map": "^0.7.4"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

- [ ] **Step 4: Create `packages/core/src/index.ts`**

```ts
export {}
```

- [ ] **Step 5: Install package deps**

Run: `pnpm install`
Expected: Adds `source-map` to `packages/core/node_modules`.

- [ ] **Step 6: Verify build runs**

Run: `pnpm --filter @react-perfscope/core build`
Expected: Creates `packages/core/dist/index.js`, `index.cjs`, `index.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): scaffold @react-perfscope/core package"
```

---

## Task 3: Define core types

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/types.ts`**

```ts
export type StackFrame = {
  file: string
  line: number
  col: number
  fnName?: string
}

export type ForcedReflowSignal = {
  kind: 'forced-reflow'
  at: number
  duration: number
  stack: StackFrame[]
}

export type LayoutShiftSignal = {
  kind: 'layout-shift'
  at: number
  value: number
  sources: DOMRect[]
}

export type LongTaskSignal = {
  kind: 'long-task'
  at: number
  duration: number
  stack: StackFrame[]
}

export type PaintSignal = {
  kind: 'paint'
  at: number
  rect: DOMRect
  cause: 'style' | 'layout' | 'unknown'
}

export type WebVitalSignal = {
  kind: 'web-vital'
  name: 'LCP' | 'FID' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
  value: number
}

export type NetworkSignal = {
  kind: 'network'
  url: string
  startedAt: number
  duration: number
  size: number
  blocking: boolean
}

export type RenderSignal = {
  kind: 'render'
  at: number
  component: string
  reason: string
  duration: number
}

export type Signal =
  | ForcedReflowSignal
  | LayoutShiftSignal
  | LongTaskSignal
  | PaintSignal
  | WebVitalSignal
  | NetworkSignal
  | RenderSignal

export type SignalKind = Signal['kind']

export interface RecordingResult {
  signals: Signal[]
  startedAt: number
  duration: number
}

export interface Collector {
  readonly kind: SignalKind
  activate(emit: (signal: Signal) => void): void
  deactivate(): void
}

export interface Recorder {
  start(): void
  stop(): RecordingResult
  isRecording(): boolean
  onSignal(cb: (signal: Signal) => void): () => void
}
```

- [ ] **Step 2: Re-export from `packages/core/src/index.ts`**

```ts
export * from './types'
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --filter @react-perfscope/core typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): define Signal and Recorder types"
```

---

## Task 4: Recorder state machine — start/stop/isRecording (TDD)

**Files:**
- Create: `packages/core/tests/recorder.test.ts`
- Create: `packages/core/src/recorder.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/recorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRecorder } from '../src/recorder'

describe('Recorder state machine', () => {
  it('is not recording initially', () => {
    const r = createRecorder()
    expect(r.isRecording()).toBe(false)
  })

  it('isRecording true after start', () => {
    const r = createRecorder()
    r.start()
    expect(r.isRecording()).toBe(true)
  })

  it('isRecording false after stop', () => {
    const r = createRecorder()
    r.start()
    r.stop()
    expect(r.isRecording()).toBe(false)
  })

  it('start is idempotent (does not throw or reset)', () => {
    const r = createRecorder()
    r.start()
    expect(() => r.start()).not.toThrow()
    expect(r.isRecording()).toBe(true)
  })

  it('stop on a non-recording instance returns an empty result without throwing', () => {
    const r = createRecorder()
    const result = r.stop()
    expect(result.signals).toEqual([])
    expect(result.duration).toBe(0)
  })

  it('stop returns a RecordingResult with correct timing', async () => {
    const r = createRecorder()
    const before = performance.now()
    r.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const result = r.stop()
    expect(result.startedAt).toBeGreaterThanOrEqual(before)
    expect(result.duration).toBeGreaterThanOrEqual(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: FAIL with module not found / `createRecorder` undefined.

- [ ] **Step 3: Implement Recorder state machine**

Create `packages/core/src/recorder.ts`:

```ts
import type { Recorder, RecordingResult, Signal } from './types'

export function createRecorder(): Recorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []

  return {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
      }
      const duration = performance.now() - startedAt
      const result: RecordingResult = {
        signals: buffer.slice(),
        startedAt,
        duration,
      }
      recording = false
      buffer = []
      return result
    },
    isRecording() {
      return recording
    },
    onSignal() {
      return () => {}
    },
  }
}
```

- [ ] **Step 4: Re-export from `packages/core/src/index.ts`**

```ts
export * from './types'
export { createRecorder } from './recorder'
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): implement Recorder state machine (start/stop/isRecording)"
```

---

## Task 5: Recorder signal buffering (TDD)

**Files:**
- Modify: `packages/core/tests/recorder.test.ts`
- Modify: `packages/core/src/recorder.ts`

- [ ] **Step 1: Add failing tests for buffering**

Append to `packages/core/tests/recorder.test.ts`:

```ts
import type { Signal } from '../src/types'

const makeLongTask = (at: number, duration: number): Signal => ({
  kind: 'long-task',
  at,
  duration,
  stack: [],
})

describe('Recorder signal buffering', () => {
  it('buffers signals pushed while recording', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    r.__push(makeLongTask(1, 60))
    r.__push(makeLongTask(2, 80))
    const result = r.stop()
    expect(result.signals).toHaveLength(2)
  })

  it('drops signals pushed while not recording', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.__push(makeLongTask(1, 60))
    r.start()
    r.stop()
    r.__push(makeLongTask(2, 80))
    const result = r.stop()
    expect(result.signals).toEqual([])
  })

  it('clears buffer on next start', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    r.__push(makeLongTask(1, 60))
    r.stop()
    r.start()
    const result = r.stop()
    expect(result.signals).toEqual([])
  })

  it('caps buffer at 10,000 signals (drops oldest)', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    for (let i = 0; i < 10_005; i++) {
      r.__push(makeLongTask(i, 60))
    }
    const result = r.stop()
    expect(result.signals).toHaveLength(10_000)
    // Oldest (at = 0..4) should be dropped; remaining starts at at = 5
    expect((result.signals[0] as { at: number }).at).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: New tests FAIL because `__push` doesn't exist.

- [ ] **Step 3: Add internal push method to Recorder**

Replace `packages/core/src/recorder.ts` contents with:

```ts
import type { Recorder, RecordingResult, Signal } from './types'

const BUFFER_CAP = 10_000

export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
}

export function createRecorder(): InternalRecorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []

  return {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
      }
      const duration = performance.now() - startedAt
      const result: RecordingResult = {
        signals: buffer.slice(),
        startedAt,
        duration,
      }
      recording = false
      buffer = []
      return result
    },
    isRecording() {
      return recording
    },
    onSignal() {
      return () => {}
    },
    __push(signal: Signal) {
      if (!recording) return
      buffer.push(signal)
      if (buffer.length > BUFFER_CAP) {
        buffer.splice(0, buffer.length - BUFFER_CAP)
      }
    },
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: All tests pass (10 total).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add signal buffering with 10k cap"
```

---

## Task 6: Recorder onSignal subscription (TDD)

**Files:**
- Modify: `packages/core/tests/recorder.test.ts`
- Modify: `packages/core/src/recorder.ts`

- [ ] **Step 1: Add failing tests for subscription**

Append to `packages/core/tests/recorder.test.ts`:

```ts
describe('Recorder onSignal subscription', () => {
  it('delivers buffered signals to subscribers while recording', () => {
    const r = createRecorder()
    const received: Signal[] = []
    r.onSignal((s) => received.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    r.__push(makeLongTask(2, 60))
    expect(received).toHaveLength(2)
  })

  it('unsubscribe stops delivery', () => {
    const r = createRecorder()
    const received: Signal[] = []
    const unsubscribe = r.onSignal((s) => received.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    unsubscribe()
    r.__push(makeLongTask(2, 60))
    expect(received).toHaveLength(1)
  })

  it('multiple subscribers all receive', () => {
    const r = createRecorder()
    const a: Signal[] = []
    const b: Signal[] = []
    r.onSignal((s) => a.push(s))
    r.onSignal((s) => b.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('subscriber error does not break other subscribers', () => {
    const r = createRecorder()
    const received: Signal[] = []
    r.onSignal(() => {
      throw new Error('boom')
    })
    r.onSignal((s) => received.push(s))
    r.start()
    expect(() => r.__push(makeLongTask(1, 60))).not.toThrow()
    expect(received).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: New tests FAIL because `onSignal` is a no-op.

- [ ] **Step 3: Implement subscription**

Replace `packages/core/src/recorder.ts` contents with:

```ts
import type { Recorder, RecordingResult, Signal } from './types'

const BUFFER_CAP = 10_000

export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
}

export function createRecorder(): InternalRecorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []
  const subscribers = new Set<(s: Signal) => void>()

  function notify(signal: Signal) {
    for (const cb of subscribers) {
      try {
        cb(signal)
      } catch (err) {
        console.warn('[react-perfscope] subscriber threw:', err)
      }
    }
  }

  return {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
      }
      const duration = performance.now() - startedAt
      const result: RecordingResult = {
        signals: buffer.slice(),
        startedAt,
        duration,
      }
      recording = false
      buffer = []
      return result
    },
    isRecording() {
      return recording
    },
    onSignal(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    __push(signal: Signal) {
      if (!recording) return
      buffer.push(signal)
      if (buffer.length > BUFFER_CAP) {
        buffer.splice(0, buffer.length - BUFFER_CAP)
      }
      notify(signal)
    },
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/recorder.test.ts`
Expected: All tests pass (14 total).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): implement onSignal subscription with error isolation"
```

---

## Task 7: Sourcemap module — stack parsing (TDD)

**Files:**
- Create: `packages/core/tests/sourcemap.test.ts`
- Create: `packages/core/src/sourcemap.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for stack parsing**

Create `packages/core/tests/sourcemap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseStack } from '../src/sourcemap'

describe('parseStack', () => {
  it('parses V8/Chrome stack format', () => {
    const raw = `Error
    at doWork (http://localhost:3000/src/app.ts:42:13)
    at handle (http://localhost:3000/src/main.ts:7:5)`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
      { fnName: 'handle', file: 'http://localhost:3000/src/main.ts', line: 7, col: 5 },
    ])
  })

  it('parses anonymous frames (no fnName)', () => {
    const raw = `Error
    at http://localhost:3000/src/app.ts:42:13`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
    ])
  })

  it('parses Firefox/Safari stack format', () => {
    const raw = `doWork@http://localhost:3000/src/app.ts:42:13
handle@http://localhost:3000/src/main.ts:7:5`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
      { fnName: 'handle', file: 'http://localhost:3000/src/main.ts', line: 7, col: 5 },
    ])
  })

  it('returns empty array for empty/undefined stack', () => {
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack('')).toEqual([])
  })

  it('skips lines that do not look like frames', () => {
    const raw = `Error: boom
    some garbage line
    at doWork (http://localhost:3000/src/app.ts:42:13)`
    const frames = parseStack(raw)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.fnName).toBe('doWork')
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/sourcemap.test.ts`
Expected: FAIL with `parseStack` not found.

- [ ] **Step 3: Implement `parseStack`**

Create `packages/core/src/sourcemap.ts`:

```ts
import type { StackFrame } from './types'

const CHROME_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/
const FIREFOX_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/

export function parseStack(raw: string | undefined): StackFrame[] {
  if (!raw) return []
  const frames: StackFrame[] = []
  for (const line of raw.split('\n')) {
    const chromeMatch = line.match(CHROME_FRAME)
    if (chromeMatch) {
      const [, fnName, file, lineStr, colStr] = chromeMatch
      const frame: StackFrame = {
        file: file ?? '',
        line: Number(lineStr),
        col: Number(colStr),
      }
      if (fnName) frame.fnName = fnName
      frames.push(frame)
      continue
    }
    const firefoxMatch = line.match(FIREFOX_FRAME)
    if (firefoxMatch) {
      const [, fnName, file, lineStr, colStr] = firefoxMatch
      const frame: StackFrame = {
        file: file ?? '',
        line: Number(lineStr),
        col: Number(colStr),
      }
      if (fnName) frame.fnName = fnName
      frames.push(frame)
    }
  }
  return frames
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/sourcemap.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Re-export from index**

Replace `packages/core/src/index.ts` contents with:

```ts
export * from './types'
export { createRecorder } from './recorder'
export { parseStack } from './sourcemap'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add parseStack for Chrome/Firefox stack formats"
```

---

## Task 8: Sourcemap module — resolveFrame with source-map library (TDD)

**Files:**
- Modify: `packages/core/tests/sourcemap.test.ts`
- Modify: `packages/core/src/sourcemap.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing tests for `resolveFrame`**

Append to `packages/core/tests/sourcemap.test.ts`:

```ts
import { resolveFrame } from '../src/sourcemap'
import type { RawSourceMap } from 'source-map'

// Minimal hand-crafted source map: bundled.js (col 4) → src.ts (line 5, col 2)
const TEST_MAP: RawSourceMap = {
  version: 3,
  sources: ['src.ts'],
  names: ['doWork'],
  mappings: 'AAKEA',
  file: 'bundled.js',
}

describe('resolveFrame', () => {
  it('resolves a minified frame to original via source map', async () => {
    const resolved = await resolveFrame(
      { file: 'http://x/bundled.js', line: 1, col: 4, fnName: 'doWork' },
      async () => TEST_MAP
    )
    expect(resolved.file).toBe('src.ts')
    expect(resolved.line).toBe(5)
    expect(resolved.col).toBe(2)
  })

  it('returns the input unchanged when fetchMap returns null', async () => {
    const input = { file: 'http://x/bundled.js', line: 1, col: 4 }
    const resolved = await resolveFrame(input, async () => null)
    expect(resolved).toEqual(input)
  })

  it('returns the input unchanged when fetchMap throws', async () => {
    const input = { file: 'http://x/bundled.js', line: 1, col: 4 }
    const resolved = await resolveFrame(input, async () => {
      throw new Error('network fail')
    })
    expect(resolved).toEqual(input)
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/sourcemap.test.ts`
Expected: FAIL with `resolveFrame` not found.

- [ ] **Step 3: Implement `resolveFrame`**

Append to `packages/core/src/sourcemap.ts`:

```ts
import { SourceMapConsumer, type RawSourceMap } from 'source-map'

export type FetchMap = (file: string) => Promise<RawSourceMap | null>

export async function resolveFrame(
  frame: StackFrame,
  fetchMap: FetchMap
): Promise<StackFrame> {
  try {
    const map = await fetchMap(frame.file)
    if (!map) return frame
    const consumer = await new SourceMapConsumer(map)
    try {
      const pos = consumer.originalPositionFor({
        line: frame.line,
        column: frame.col,
      })
      if (pos.source == null || pos.line == null || pos.column == null) {
        return frame
      }
      const resolved: StackFrame = {
        file: pos.source,
        line: pos.line,
        col: pos.column,
      }
      if (pos.name) resolved.fnName = pos.name
      else if (frame.fnName) resolved.fnName = frame.fnName
      return resolved
    } finally {
      consumer.destroy()
    }
  } catch (err) {
    console.warn('[react-perfscope] resolveFrame failed:', err)
    return frame
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/sourcemap.test.ts`
Expected: All 8 tests pass.

- [ ] **Step 5: Re-export `resolveFrame` and `FetchMap`**

Replace `packages/core/src/index.ts`:

```ts
export * from './types'
export { createRecorder } from './recorder'
export { parseStack, resolveFrame } from './sourcemap'
export type { FetchMap } from './sourcemap'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add resolveFrame using source-map library"
```

---

## Task 9: Long-tasks collector (TDD)

**Files:**
- Create: `packages/core/tests/collectors/long-tasks.test.ts`
- Create: `packages/core/src/collectors/long-tasks.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests with PerformanceObserver mock**

Create `packages/core/tests/collectors/long-tasks.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLongTasksCollector } from '../../src/collectors/long-tasks'
import type { LongTaskSignal, Signal } from '../../src/types'

type ObserverCb = (list: { getEntries: () => PerformanceEntry[] }) => void

let observers: { cb: ObserverCb; opts: PerformanceObserverInit }[] = []
let disconnectCount = 0

class FakeObserver {
  private cb: ObserverCb
  constructor(cb: ObserverCb) {
    this.cb = cb
  }
  observe(opts: PerformanceObserverInit) {
    observers.push({ cb: this.cb, opts })
  }
  disconnect() {
    disconnectCount++
  }
}

beforeEach(() => {
  observers = []
  disconnectCount = 0
  ;(globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = FakeObserver
})

afterEach(() => {
  delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
})

function fireEntry(entry: Partial<PerformanceEntry>) {
  const list = {
    getEntries: () => [{ entryType: 'longtask', startTime: 0, duration: 0, name: '', ...entry } as PerformanceEntry],
  }
  for (const { cb, opts } of observers) {
    if (opts.type === 'longtask' || opts.entryTypes?.includes('longtask')) {
      cb(list)
    }
  }
}

describe('long-tasks collector', () => {
  it('registers a PerformanceObserver on activate', () => {
    const collector = createLongTasksCollector()
    collector.activate(() => {})
    expect(observers).toHaveLength(1)
    const opts = observers[0]!.opts
    const observed = (opts.type ?? opts.entryTypes?.[0]) as string
    expect(observed).toBe('longtask')
  })

  it('emits long-task signals normalized from entries', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    fireEntry({ startTime: 100, duration: 75 })
    expect(got).toHaveLength(1)
    const s = got[0] as LongTaskSignal
    expect(s.kind).toBe('long-task')
    expect(s.at).toBe(100)
    expect(s.duration).toBe(75)
  })

  it('disconnect on deactivate', () => {
    const collector = createLongTasksCollector()
    collector.activate(() => {})
    collector.deactivate()
    expect(disconnectCount).toBe(1)
  })

  it('does not emit after deactivate', () => {
    const collector = createLongTasksCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    collector.deactivate()
    fireEntry({ startTime: 100, duration: 75 })
    expect(got).toHaveLength(0)
  })

  it('gracefully no-ops when PerformanceObserver is missing', () => {
    delete (globalThis as unknown as { PerformanceObserver?: unknown }).PerformanceObserver
    const collector = createLongTasksCollector()
    expect(() => collector.activate(() => {})).not.toThrow()
    expect(() => collector.deactivate()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/collectors/long-tasks.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement long-tasks collector**

Create `packages/core/src/collectors/long-tasks.ts`:

```ts
import type { Collector, Signal } from '../types'

export function createLongTasksCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'long-task',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; long-tasks disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const entry of list.getEntries()) {
            emit({
              kind: 'long-task',
              at: entry.startTime,
              duration: entry.duration,
              stack: [],
            })
          }
        })
        observer.observe({ type: 'longtask', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] long-tasks collector failed to start:', err)
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

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/collectors/long-tasks.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Re-export from index**

Replace `packages/core/src/index.ts`:

```ts
export * from './types'
export { createRecorder } from './recorder'
export { parseStack, resolveFrame } from './sourcemap'
export type { FetchMap } from './sourcemap'
export { createLongTasksCollector } from './collectors/long-tasks'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add long-tasks collector with PerformanceObserver"
```

---

## Task 10: Forced-reflow collector — monkey-patch + tests (TDD)

**Phase 1 scope note:** This collector emits on every layout API read while recording (no "dirty tracking"). It will over-report — every `offsetWidth` read becomes a signal even if no preceding style write happened. Phase 2 will add proper dirty tracking via synchronous patches on style/attribute setters. The Phase 1 README documents this caveat.

**Files:**
- Create: `packages/core/tests/collectors/forced-reflow.test.ts`
- Create: `packages/core/src/collectors/forced-reflow.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/collectors/forced-reflow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createForcedReflowCollector } from '../../src/collectors/forced-reflow'
import type { ForcedReflowSignal, Signal } from '../../src/types'

describe('forced-reflow collector', () => {
  it('emits forced-reflow signal when offsetWidth is read while active', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      expect(got.length).toBeGreaterThanOrEqual(1)
      const s = got[0] as ForcedReflowSignal
      expect(s.kind).toBe('forced-reflow')
      expect(typeof s.at).toBe('number')
      expect(typeof s.duration).toBe('number')
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('emits when getBoundingClientRect is called while active', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      div.getBoundingClientRect()
      expect(got.length).toBeGreaterThanOrEqual(1)
    } finally {
      collector.deactivate()
    }
  })

  it('does not emit before activate or after deactivate', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []

    // Before activate
    const div1 = document.createElement('div')
    document.body.appendChild(div1)
    void div1.offsetWidth
    expect(got).toHaveLength(0)

    // While active
    collector.activate((s) => got.push(s))
    void div1.offsetWidth
    const afterActivate = got.length
    expect(afterActivate).toBeGreaterThanOrEqual(1)

    // After deactivate
    collector.deactivate()
    void div1.offsetWidth
    expect(got).toHaveLength(afterActivate)
  })

  it('restores original getter on deactivate', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const collector = createForcedReflowCollector()
    collector.activate(() => {})
    collector.deactivate()
    const after = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    expect(after?.get).toBe(before?.get)
  })

  it('captures stack frames', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function trigger() {
        const div = document.createElement('div')
        document.body.appendChild(div)
        void div.offsetWidth
      }
      trigger()
      const s = got[0] as ForcedReflowSignal
      // happy-dom may produce minimal stacks; we only require parseStack ran
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('gracefully no-ops activate when no DOM globals available (smoke)', () => {
    const collector = createForcedReflowCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/collectors/forced-reflow.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement forced-reflow collector**

Create `packages/core/src/collectors/forced-reflow.ts`:

```ts
import type { Collector, Signal } from '../types'
import { parseStack } from '../sourcemap'

const LAYOUT_GETTERS = [
  'offsetWidth',
  'offsetHeight',
  'offsetLeft',
  'offsetTop',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
] as const

const LAYOUT_METHODS = ['getBoundingClientRect', 'getClientRects'] as const

type SavedDescriptor = {
  proto: object
  key: string
  descriptor: PropertyDescriptor
}

export function createForcedReflowCollector(): Collector {
  let active = false
  let emit: (s: Signal) => void = () => {}
  const saved: SavedDescriptor[] = []

  function patchGetter(proto: object, key: string) {
    if (typeof proto !== 'object' || proto === null) return
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc || !desc.get) return
    saved.push({ proto, key, descriptor: desc })
    const originalGet = desc.get
    Object.defineProperty(proto, key, {
      configurable: true,
      get(this: unknown) {
        if (active) {
          const at = performance.now()
          const stack = parseStack(new Error().stack)
          const value = originalGet.call(this)
          const duration = performance.now() - at
          emit({ kind: 'forced-reflow', at, duration, stack })
          return value
        }
        return originalGet.call(this)
      },
      set: desc.set,
    })
  }

  function patchMethod(proto: object, key: string) {
    if (typeof proto !== 'object' || proto === null) return
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc || typeof desc.value !== 'function') return
    saved.push({ proto, key, descriptor: desc })
    const original = desc.value as (...args: unknown[]) => unknown
    Object.defineProperty(proto, key, {
      configurable: true,
      writable: true,
      value: function patchedLayoutMethod(this: unknown, ...args: unknown[]) {
        if (active) {
          const at = performance.now()
          const stack = parseStack(new Error().stack)
          const value = original.apply(this, args)
          const duration = performance.now() - at
          emit({ kind: 'forced-reflow', at, duration, stack })
          return value
        }
        return original.apply(this, args)
      },
    })
  }

  return {
    kind: 'forced-reflow',
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
    deactivate() {
      if (!active) return
      active = false
      for (const { proto, key, descriptor } of saved) {
        Object.defineProperty(proto, key, descriptor)
      }
      saved.length = 0
    },
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test packages/core/tests/collectors/forced-reflow.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Re-export from index**

Replace `packages/core/src/index.ts`:

```ts
export * from './types'
export { createRecorder } from './recorder'
export { parseStack, resolveFrame } from './sourcemap'
export type { FetchMap } from './sourcemap'
export { createLongTasksCollector } from './collectors/long-tasks'
export { createForcedReflowCollector } from './collectors/forced-reflow'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): add forced-reflow collector via layout API monkey-patch"
```

---

## Task 11: Wire Recorder ⇄ Collectors (integration TDD)

**Files:**
- Create: `packages/core/tests/integration.test.ts`
- Modify: `packages/core/src/recorder.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing integration tests**

Create `packages/core/tests/integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRecorder } from '../src/recorder'
import { createLongTasksCollector } from '../src/collectors/long-tasks'
import type { Signal } from '../src/types'

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

function fireLongTask(duration: number) {
  for (const { cb } of observers) {
    cb({
      getEntries: () => [
        { entryType: 'longtask', startTime: performance.now(), duration, name: '' } as PerformanceEntry,
      ],
    })
  }
}

describe('Recorder + collector integration', () => {
  it('start activates registered collectors and routes signals to buffer', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.start()
    fireLongTask(60)
    fireLongTask(80)
    const result = r.stop()
    expect(result.signals).toHaveLength(2)
    expect(result.signals.every((s: Signal) => s.kind === 'long-task')).toBe(true)
  })

  it('stop deactivates collectors (no more signals)', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.start()
    fireLongTask(60)
    r.stop()
    fireLongTask(80) // should not be buffered
    r.start()
    const result = r.stop()
    expect(result.signals).toHaveLength(0)
  })

  it('multiple collectors can be registered', () => {
    const r = createRecorder()
    r.use(createLongTasksCollector())
    r.use(createLongTasksCollector()) // second one harmless for this test
    r.start()
    fireLongTask(60)
    const result = r.stop()
    expect(result.signals.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/core/tests/integration.test.ts`
Expected: FAIL with `r.use is not a function`.

- [ ] **Step 3: Add `use` to Recorder**

Replace `packages/core/src/recorder.ts`:

```ts
import type { Collector, Recorder, RecordingResult, Signal } from './types'

const BUFFER_CAP = 10_000

export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
  use: (collector: Collector) => void
}

export function createRecorder(): InternalRecorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []
  const subscribers = new Set<(s: Signal) => void>()
  const collectors: Collector[] = []

  function notify(signal: Signal) {
    for (const cb of subscribers) {
      try {
        cb(signal)
      } catch (err) {
        console.warn('[react-perfscope] subscriber threw:', err)
      }
    }
  }

  function push(signal: Signal) {
    if (!recording) return
    buffer.push(signal)
    if (buffer.length > BUFFER_CAP) {
      buffer.splice(0, buffer.length - BUFFER_CAP)
    }
    notify(signal)
  }

  return {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
      for (const c of collectors) {
        try {
          c.activate(push)
        } catch (err) {
          console.warn(`[react-perfscope] collector ${c.kind} failed to activate:`, err)
        }
      }
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
      }
      for (const c of collectors) {
        try {
          c.deactivate()
        } catch (err) {
          console.warn(`[react-perfscope] collector ${c.kind} failed to deactivate:`, err)
        }
      }
      const duration = performance.now() - startedAt
      const result: RecordingResult = {
        signals: buffer.slice(),
        startedAt,
        duration,
      }
      recording = false
      buffer = []
      return result
    },
    isRecording() {
      return recording
    },
    onSignal(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    use(collector) {
      collectors.push(collector)
    },
    __push: push,
  }
}
```

- [ ] **Step 4: Run all tests to verify pass**

Run: `pnpm test`
Expected: All tests pass (recorder + sourcemap + collectors + integration).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): wire collectors into Recorder via use()"
```

---

## Task 12: Public API + build verification

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/README.md`

- [ ] **Step 1: Finalize public exports**

Replace `packages/core/src/index.ts`:

```ts
// Types
export * from './types'

// Recorder
export { createRecorder } from './recorder'
export type { InternalRecorder } from './recorder'

// Sourcemap utilities
export { parseStack, resolveFrame } from './sourcemap'
export type { FetchMap } from './sourcemap'

// Collectors
export { createLongTasksCollector } from './collectors/long-tasks'
export { createForcedReflowCollector } from './collectors/forced-reflow'
```

- [ ] **Step 2: Create `packages/core/README.md`**

Use the literal content below (4-backtick fence used here only to embed the README — copy what is *inside* the outer `~~~` block, no fences of its own at the document top):

~~~markdown
# @react-perfscope/core

Core recording engine for `react-perfscope`. Provides a `Recorder` and pluggable `Collector`s that emit normalized performance signals.

## Status

Phase 1 — minimal implementation. Forced-reflow and long-tasks collectors only.

**Phase 1 caveat:** The forced-reflow collector emits on every layout read during recording. It does not yet track whether a preceding style write actually invalidated layout, so non-thrashing reads are also reported. Phase 2 adds proper dirty tracking.

## Example

```ts
import {
  createRecorder,
  createLongTasksCollector,
  createForcedReflowCollector,
} from '@react-perfscope/core'

const recorder = createRecorder()
recorder.use(createLongTasksCollector())
recorder.use(createForcedReflowCollector())

recorder.start()
// ... user interaction ...
const result = recorder.stop()

console.log(result.signals)
```
~~~

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @react-perfscope/core typecheck`
Expected: No errors.

- [ ] **Step 4: Run build**

Run: `pnpm --filter @react-perfscope/core build`
Expected: `dist/index.js`, `index.cjs`, `index.d.ts` produced with no errors.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Inspect `dist/index.d.ts`**

Run: `cat packages/core/dist/index.d.ts | head -50`
Expected: Exports `createRecorder`, `Signal`, `Collector`, `createLongTasksCollector`, `createForcedReflowCollector`, etc.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/README.md
git commit -m "feat(core): finalize Phase 1 public API + README"
```

---

## Phase 1 Acceptance Criteria

After all 12 tasks complete:

- [ ] `pnpm install` works from clean clone
- [ ] `pnpm test` passes 100%
- [ ] `pnpm --filter @react-perfscope/core build` produces `dist/`
- [ ] `pnpm --filter @react-perfscope/core typecheck` passes
- [ ] Manual sanity: `import { createRecorder, createLongTasksCollector, createForcedReflowCollector } from '@react-perfscope/core'` resolves
- [ ] Recorder.start/stop/isRecording/onSignal/use all functional
- [ ] Two collectors (forced-reflow, long-tasks) emit normalized signals into Recorder buffer
- [ ] Sourcemap parse + resolve utilities work for Chrome and Firefox stack formats

## Next Phase Preview (Phase 2)

- Remaining 5 collectors: layout-shift, paint, web-vitals, network, render
- `@react-perfscope/react` package: fiber walker, render-collector, attribution

(Phase 2 plan to be written after Phase 1 completes.)
