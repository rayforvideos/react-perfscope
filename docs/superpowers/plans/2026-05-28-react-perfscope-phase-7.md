# react-perfscope Phase 7 — Panel v2: detail, ratings, grouping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Panel actually useful for debugging. Today each signal is a single line — the captured data (stacks, rects, web-vital ratings, etc.) is in memory but invisible. This phase adds:

1. **Expandable detail per row** — click a signal to see its stack, sources, full URL, etc.
2. **Severity/rating coloring** — web-vitals show good/needs/poor dots; long-tasks and forced-reflows color by duration.
3. **Grouping by component / source** — render and forced-reflow tabs get a "Group by" toggle so 28 renders become 4 component buckets.

**Out of scope (Phase 8+):** timeline view, layout-shift node identification (needs DOM resolution), forced-reflow source-map resolution into UI.

**Architecture:**
- Extract the per-signal `<li>` into a `SignalRow` Preact component that owns its `expanded` state. Detail rendering branches on `signal.kind` — each kind gets its own renderer (`renderForcedReflowDetail`, etc.). Single file, tagged dispatch — no new modules.
- Severity uses small helper functions (`webVitalRating(name, value)`, `longTaskSeverity(ms)`) returning a discriminated rating type `'good' | 'needs' | 'poor' | 'neutral'`. The UI maps each to a color.
- Grouping is a per-tab state: `'chronological' | 'by-component' | 'by-source'`. Only the tabs that make sense expose the toggle (render → by-component; forced-reflow → by-source).

**Working Directory:** All paths relative to `/Users/ray/workspace/react-perfscope`. Branch: `phase-7-panel-v2`.

---

## Task 1: Expandable signal rows + per-kind detail rendering

**Goal:** Each signal row becomes expandable. Clicking the row reveals a detail panel below the summary. Detail content branches on kind:

- **forced-reflow:** stack frames (one per line, monospace)
- **layout-shift:** value, source rects (x/y/w/h list)
- **long-task:** start/end timestamps
- **network:** full URL, blocking flag, transferSize bytes
- **paint:** name (first-paint vs first-contentful-paint)
- **web-vital:** rating + threshold table
- **render:** component, reason, duration

**Files:**
- Modify: `packages/ui/src/panel.tsx` — extract `SignalRow`, add per-kind detail renderers
- Modify: `packages/ui/tests/panel.test.tsx` — new tests for expand + detail rendering

- [ ] **Step 1: Add expandable row tests**

Append to `packages/ui/tests/panel.test.tsx` (after the existing `describe('Panel', ...)` block, before `describe('Panel overlay integration', ...)`):

```tsx
describe('Panel signal row expansion', () => {
  it('does not show details by default', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 10, duration: 1.5, stack: [{ file: 'App.tsx', line: 42, col: 7, fnName: 'click' }] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).not.toContain('App.tsx')
    cleanup()
  })

  it('reveals stack frames when a forced-reflow row is clicked', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 10, duration: 1.5, stack: [{ file: 'App.tsx', line: 42, col: 7, fnName: 'click' }] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const row = container.querySelector('li')!
    fireEvent.click(row)
    expect(container.textContent).toContain('App.tsx:42')
    expect(container.textContent).toContain('click')
    cleanup()
  })

  it('shows full URL for network signal on expand', () => {
    const result = makeResult([
      { kind: 'network', url: 'https://example.com/long/path/that/is/usually/cut', startedAt: 0, duration: 30, size: 1024, blocking: true },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    fireEvent.click(container.querySelector('li')!)
    expect(container.textContent).toContain('https://example.com/long/path/that/is/usually/cut')
    expect(container.textContent).toContain('blocking')
    cleanup()
  })

  it('shows render reason and duration on expand', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'Header', reason: 'state-change', duration: 4.2 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    fireEvent.click(container.querySelector('li')!)
    expect(container.textContent).toContain('state-change')
    cleanup()
  })

  it('only one row is expanded at a time', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'A', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'B', reason: 'commit', duration: 1 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rows = container.querySelectorAll('li')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!)
    // Both 'A' and 'B' appear in the summary line; the assertion is that the
    // first row's expanded detail is collapsed once the second is opened.
    // We assert by checking ARIA expanded state.
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(rows[1]!.getAttribute('aria-expanded')).toBe('true')
    cleanup()
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 5 new tests fail (expanded details don't exist yet).

- [ ] **Step 3: Refactor `panel.tsx` to extract `SignalRow` + add per-kind detail renderers**

Replace `packages/ui/src/panel.tsx` contents with:

```tsx
import { h } from 'preact'
import { useState, useMemo, useEffect } from 'preact/hooks'
import type {
  RecordingResult,
  Signal,
  SignalKind,
  ForcedReflowSignal,
  LayoutShiftSignal,
  LongTaskSignal,
  NetworkSignal,
  PaintSignal,
  RenderSignal,
  WebVitalSignal,
} from '@react-perfscope/core'
import type { WidgetPosition } from './types'
import { showOverlay, hideOverlay, hideAllOverlays } from './overlay'

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

const POSITION_STYLES: Record<WidgetPosition, Record<string, string>> = {
  'bottom-right': { bottom: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'top-left': { top: '16px', left: '16px' },
}

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
  for (const s of signals) acc[s.kind].push(s)
  return acc
}

function summary(s: Signal): string {
  switch (s.kind) {
    case 'forced-reflow':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(2)}ms`
    case 'layout-shift':
      return `@ ${s.at.toFixed(1)}ms • value ${s.value.toFixed(3)} • ${s.sources.length} source(s)`
    case 'long-task':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(1)}ms`
    case 'paint':
      return `@ ${s.at.toFixed(1)}ms • ${s.cause}`
    case 'network':
      return `${s.url.length > 60 ? s.url.slice(0, 57) + '...' : s.url} • ${s.duration.toFixed(0)}ms${s.blocking ? ' • blocking' : ''}`
    case 'web-vital':
      return `${s.name}: ${s.value.toFixed(2)}`
    case 'render':
      return `${s.component} • ${s.reason} • ${s.duration.toFixed(2)}ms`
  }
}

const detailLabelStyle = { color: '#888', marginRight: '6px' } as const
const detailRowStyle = { padding: '2px 0', display: 'flex', gap: '6px' } as const
const monoStyle = {
  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
  fontSize: '11px',
} as const

function ForcedReflowDetail({ s }: { s: ForcedReflowSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      {s.stack.length === 0 ? (
        <div style={{ color: '#666' }}>No stack captured.</div>
      ) : (
        s.stack.slice(0, 8).map((f, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            {f.fnName ? <span>{f.fnName}</span> : <span style={{ color: '#666' }}>(anonymous)</span>}
            <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
          </div>
        ))
      )}
    </div>
  )
}

function LayoutShiftDetail({ s }: { s: LayoutShiftSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>value</span><span>{s.value.toFixed(4)}</span></div>
      {s.sources.length === 0 ? (
        <div style={{ color: '#666' }}>No source rects.</div>
      ) : (
        s.sources.map((r, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            <span style={{ color: '#888' }}>rect {i + 1}</span>
            <span>x={r.x.toFixed(0)} y={r.y.toFixed(0)} w={r.width.toFixed(0)} h={r.height.toFixed(0)}</span>
          </div>
        ))
      )}
    </div>
  )
}

function LongTaskDetail({ s }: { s: LongTaskSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>started</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>ended</span><span>{(s.at + s.duration).toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(2)}ms</span></div>
      {s.stack.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          {s.stack.slice(0, 5).map((f, i) => (
            <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
              {f.fnName && <span>{f.fnName}</span>}
              <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NetworkDetail({ s }: { s: NetworkSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={{ ...detailRowStyle, ...monoStyle, wordBreak: 'break-all' as const }}>
        <span>{s.url}</span>
      </div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>started</span><span>{s.startedAt.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>size</span><span>{(s.size / 1024).toFixed(2)}KB ({s.size} bytes)</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>render-blocking</span><span>{s.blocking ? 'yes' : 'no'}</span></div>
    </div>
  )
}

function PaintDetail({ s }: { s: PaintSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>at</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>cause</span><span>{s.cause}</span></div>
    </div>
  )
}

function WebVitalDetail({ s }: { s: WebVitalSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>metric</span><span>{s.name}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>value</span><span>{s.value.toFixed(2)}</span></div>
    </div>
  )
}

function RenderDetail({ s }: { s: RenderSignal }) {
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>component</span><span>{s.component}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>reason</span><span>{s.reason}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>duration</span><span>{s.duration.toFixed(3)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>at</span><span>{s.at.toFixed(2)}ms</span></div>
    </div>
  )
}

function SignalDetail({ s }: { s: Signal }) {
  switch (s.kind) {
    case 'forced-reflow': return <ForcedReflowDetail s={s} />
    case 'layout-shift': return <LayoutShiftDetail s={s} />
    case 'long-task': return <LongTaskDetail s={s} />
    case 'network': return <NetworkDetail s={s} />
    case 'paint': return <PaintDetail s={s} />
    case 'web-vital': return <WebVitalDetail s={s} />
    case 'render': return <RenderDetail s={s} />
  }
}

interface SignalRowProps {
  signal: Signal
  expanded: boolean
  onToggleExpand: () => void
  onHoverGeometry: (rects: DOMRect[] | null) => void
}

function SignalRow({ signal, expanded, onToggleExpand, onHoverGeometry }: SignalRowProps) {
  const hasGeometry = signal.kind === 'layout-shift' && signal.sources.length > 0
  return (
    <li
      aria-expanded={expanded}
      onClick={onToggleExpand}
      onMouseEnter={() => {
        if (hasGeometry && signal.kind === 'layout-shift') onHoverGeometry(signal.sources)
      }}
      onMouseLeave={() => {
        if (hasGeometry) onHoverGeometry(null)
      }}
      style={{
        padding: '6px 8px',
        borderTop: '1px solid #1a1a1a',
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
        cursor: 'pointer',
        userSelect: 'none' as const,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#888', width: '10px' }}>{expanded ? '▼' : '▶'}</span>
        <span>{summary(signal)}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a' }}>
          <SignalDetail s={signal} />
        </div>
      )}
    </li>
  )
}

export function Panel(props: PanelProps) {
  const { result, onClose, position = 'bottom-right' } = props
  const grouped = useMemo(() => groupByKind(result.signals), [result.signals])
  const kindsPresent = KIND_ORDER.filter((k) => grouped[k].length > 0)
  const [activeKind, setActiveKind] = useState<SignalKind | null>(kindsPresent[0] ?? null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => () => hideAllOverlays(), [])

  function handleHover(rects: DOMRect[] | null) {
    if (!rects) {
      hideAllOverlays()
      return
    }
    rects.forEach((r, i) => showOverlay(`signal-${i}`, r))
  }

  const panelStyle = {
    position: 'fixed' as const,
    ...POSITION_STYLES[position],
    width: '460px',
    maxHeight: '70vh',
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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>react-perfscope</strong>
        <button type="button" aria-label="Close panel" onClick={onClose}
          style={{ background: 'transparent', color: '#e6e6e6', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
          ×
        </button>
      </header>

      {kindsPresent.length === 0 && (
        <div style={{ color: '#888' }}>No signals recorded.</div>
      )}

      {kindsPresent.length > 0 && (
        <>
          <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {kindsPresent.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => { setActiveKind(kind); setExpandedKey(null) }}
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

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flexGrow: 1 }}>
            {activeKind && grouped[activeKind].map((s, i) => {
              const key = `${activeKind}-${i}`
              return (
                <SignalRow
                  key={key}
                  signal={s}
                  expanded={expandedKey === key}
                  onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
                  onHoverGeometry={handleHover}
                />
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
```

Key changes from the prior Panel:
- Each row is now a `<SignalRow>` with `aria-expanded` state and a chevron prefix
- Click toggles the expanded state — only one row can be expanded at a time
- Per-kind `*Detail` components own the expanded-state UI
- Network summary now truncates URL to 60 chars (full URL in detail)
- Width bumped from 420px → 460px to fit more detail comfortably; max-height 60vh → 70vh
- Hover handlers unified into a single `handleHover(rects | null)` callback

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: All previous tests pass + 5 new tests pass.

If the existing "shows overlay on layout-shift hover, hides on leave" test breaks due to the new hover handler signature, update its expectations: now multiple overlays may appear (one per source rect), keyed `signal-0`, `signal-1`, etc.

Specifically, the existing test expects exactly one overlay with `[data-perfscope-overlay]`. With the new code, there's still 1 per source for a 1-source layout-shift, so the test should still pass. If it doesn't, debug and adjust the helper.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: All tests pass (was 136, +5 new = 141), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/panel.tsx packages/ui/tests/panel.test.tsx
git commit -m "feat(ui): expandable signal rows with per-kind detail views"
```

---

## Task 2: Severity ratings and units

**Goal:** Add color-coded severity indicators and explicit units to the summary line:

- **web-vital:** show rating dot (●) colored good/needs/poor per Google thresholds; show units after the value (`LCP: 2400ms`)
- **long-task:** color the duration text by severity (50–100ms yellow, 100–200ms orange, >200ms red)
- **forced-reflow:** subtle row tint when duration > 4ms
- **network:** subtle red tint when `blocking === true`

**Files:**
- Modify: `packages/ui/src/panel.tsx`
- Modify: `packages/ui/tests/panel.test.tsx`

- [ ] **Step 1: Add severity helper tests**

Append to `packages/ui/tests/panel.test.tsx`:

```tsx
describe('Panel severity coloring', () => {
  it('renders web-vital with the value unit (ms for LCP) and a rating indicator', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'LCP', value: 2400 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toMatch(/2400/)
    // ms unit shown
    expect(container.textContent).toMatch(/ms/)
    // dot is decorative — assert presence by aria-label on the span
    expect(container.querySelector('[data-rating]')).toBeTruthy()
  })

  it('renders CLS without ms unit and with rating from CLS thresholds', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'CLS', value: 0.08 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    // CLS is dimensionless
    expect(container.textContent).not.toMatch(/0\.08ms/)
    const rating = container.querySelector('[data-rating]')
    expect(rating?.getAttribute('data-rating')).toBe('good')
  })

  it('marks long tasks > 100ms as severe', () => {
    const result = makeResult([
      { kind: 'long-task', at: 0, duration: 150, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rating = container.querySelector('[data-severity]')
    expect(rating?.getAttribute('data-severity')).toBe('high')
  })

  it('marks long tasks 50-100ms as medium', () => {
    const result = makeResult([
      { kind: 'long-task', at: 0, duration: 75, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rating = container.querySelector('[data-severity]')
    expect(rating?.getAttribute('data-severity')).toBe('medium')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 4 new tests fail (severity attributes don't exist yet).

- [ ] **Step 3: Add severity helpers + rendering to `panel.tsx`**

In `packages/ui/src/panel.tsx`, BEFORE the `summary()` function, add:

```tsx
type Rating = 'good' | 'needs' | 'poor'
type Severity = 'low' | 'medium' | 'high'

// Google Web Vitals thresholds (https://web.dev/vitals/).
function webVitalRating(name: WebVitalSignal['name'], value: number): Rating {
  const T: Record<WebVitalSignal['name'], [number, number]> = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  }
  const [good, needs] = T[name]
  if (value <= good) return 'good'
  if (value <= needs) return 'needs'
  return 'poor'
}

function longTaskSeverity(durationMs: number): Severity {
  if (durationMs >= 100) return 'high'
  if (durationMs >= 50) return 'medium'
  return 'low'
}

const RATING_COLOR: Record<Rating, string> = {
  good: '#34c759',
  needs: '#ff9500',
  poor: '#ff3b30',
}

const SEVERITY_COLOR: Record<Severity, string> = {
  low: '#666',
  medium: '#ff9500',
  high: '#ff3b30',
}

const WEB_VITAL_UNIT: Record<WebVitalSignal['name'], string> = {
  LCP: 'ms',
  INP: 'ms',
  CLS: '',
  FCP: 'ms',
  TTFB: 'ms',
}

function RatingDot({ rating }: { rating: Rating }) {
  return (
    <span
      data-rating={rating}
      aria-label={`rating: ${rating}`}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: RATING_COLOR[rating],
        marginRight: '6px',
        verticalAlign: 'middle',
      }}
    />
  )
}
```

Then in the `summary()` function, replace the `web-vital` case:

```tsx
    case 'web-vital': {
      const unit = WEB_VITAL_UNIT[s.name]
      return `${s.name}: ${s.value.toFixed(2)}${unit}`
    }
```

The web-vital row needs a rating dot AND a colored value. Update `SignalRow` to render this richer summary when the signal is a web-vital or long-task. The cleanest way: have `SignalRow` consult a `renderSummary(signal)` function that may return JSX, not just a string.

Replace the current row body inside `SignalRow`:

Find:
```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#888', width: '10px' }}>{expanded ? '▼' : '▶'}</span>
        <span>{summary(signal)}</span>
      </div>
```

Replace with:
```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#888', width: '10px' }}>{expanded ? '▼' : '▶'}</span>
        <SummaryLine signal={signal} />
      </div>
```

And add the `SummaryLine` component BELOW the `SignalDetail` function:

```tsx
function SummaryLine({ signal }: { signal: Signal }) {
  if (signal.kind === 'web-vital') {
    const rating = webVitalRating(signal.name, signal.value)
    const unit = WEB_VITAL_UNIT[signal.name]
    return (
      <span>
        <RatingDot rating={rating} />
        <strong>{signal.name}</strong>: {signal.value.toFixed(2)}{unit}
      </span>
    )
  }
  if (signal.kind === 'long-task') {
    const sev = longTaskSeverity(signal.duration)
    return (
      <span>
        @ {signal.at.toFixed(1)}ms • duration <span data-severity={sev} style={{ color: SEVERITY_COLOR[sev] }}>{signal.duration.toFixed(1)}ms</span>
      </span>
    )
  }
  return <span>{summary(signal)}</span>
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: All tests pass (was 141, +4 new = 145).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 145 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/panel.tsx packages/ui/tests/panel.test.tsx
git commit -m "feat(ui): severity ratings + units for web-vital and long-task"
```

---

## Task 3: Grouping toggle (render by component, forced-reflow by source)

**Goal:** For the `render` and `forced-reflow` tabs, add a small "Group by" dropdown that switches the listing between chronological and grouped views.

**Files:**
- Modify: `packages/ui/src/panel.tsx`
- Modify: `packages/ui/tests/panel.test.tsx`

- [ ] **Step 1: Add grouping tests**

Append to `packages/ui/tests/panel.test.tsx`:

```tsx
describe('Panel grouping toggle', () => {
  it('renders the grouping toggle on the render tab', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'A', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'B', reason: 'commit', duration: 1 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.queryByLabelText(/group by/i)).toBeTruthy()
    cleanup()
  })

  it('groups render signals by component when "by component" is selected', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'App', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'App', reason: 'commit', duration: 2 },
      { kind: 'render', at: 2, component: 'Counter', reason: 'commit', duration: 1 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const select = screen.getByLabelText(/group by/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'component' } })
    // After grouping: should see "App ×2" and "Counter ×1" as the row summaries
    expect(container.textContent).toMatch(/App.*×2/)
    expect(container.textContent).toMatch(/Counter.*×1/)
    cleanup()
  })

  it('does not show grouping toggle on tabs that do not support grouping', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'LCP', value: 100 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.queryByLabelText(/group by/i)).toBeNull()
    cleanup()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: 3 new tests fail (grouping doesn't exist yet).

- [ ] **Step 3: Implement grouping**

In `packages/ui/src/panel.tsx`, BEFORE the `Panel` component definition, add:

```tsx
type GroupMode = 'chronological' | 'component' | 'source'

function tabSupportsGrouping(kind: SignalKind): boolean {
  return kind === 'render' || kind === 'forced-reflow'
}

function defaultGroupingFor(kind: SignalKind): GroupMode {
  return 'chronological'
}

interface SignalGroup {
  label: string
  count: number
  signals: Signal[]
}

function groupSignals(signals: Signal[], mode: GroupMode, kind: SignalKind): SignalGroup[] {
  if (mode === 'chronological') {
    return signals.map((s, i) => ({ label: `#${i + 1}`, count: 1, signals: [s] }))
  }
  if (mode === 'component' && kind === 'render') {
    const byName = new Map<string, Signal[]>()
    for (const s of signals) {
      if (s.kind !== 'render') continue
      const k = s.component
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k)!.push(s)
    }
    return Array.from(byName.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, list]) => ({ label, count: list.length, signals: list }))
  }
  if (mode === 'source' && kind === 'forced-reflow') {
    const bySource = new Map<string, Signal[]>()
    for (const s of signals) {
      if (s.kind !== 'forced-reflow') continue
      const top = s.stack[0]
      const k = top ? `${top.file}:${top.line}:${top.col}` : '(no stack)'
      if (!bySource.has(k)) bySource.set(k, [])
      bySource.get(k)!.push(s)
    }
    return Array.from(bySource.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, list]) => ({ label, count: list.length, signals: list }))
  }
  // Fallback: chronological
  return signals.map((s, i) => ({ label: `#${i + 1}`, count: 1, signals: [s] }))
}
```

Then update the `Panel` body's list-rendering section. Find the existing block:

```tsx
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flexGrow: 1 }}>
            {activeKind && grouped[activeKind].map((s, i) => {
              const key = `${activeKind}-${i}`
              return (
                <SignalRow
                  key={key}
                  signal={s}
                  expanded={expandedKey === key}
                  onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
                  onHoverGeometry={handleHover}
                />
              )
            })}
          </ul>
```

Replace with the larger block:

```tsx
          {activeKind && tabSupportsGrouping(activeKind) && (
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '11px', color: '#888' }}
            >
              Group by
              <select
                aria-label="Group by"
                value={groupMode[activeKind] ?? 'chronological'}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as GroupMode
                  setGroupMode({ ...groupMode, [activeKind]: v })
                  setExpandedKey(null)
                }}
                style={{ background: '#1a1a1a', color: '#e6e6e6', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '2px 6px', fontSize: '11px' }}
              >
                <option value="chronological">chronological</option>
                {activeKind === 'render' && <option value="component">component</option>}
                {activeKind === 'forced-reflow' && <option value="source">source</option>}
              </select>
            </label>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flexGrow: 1 }}>
            {activeKind && groupSignals(grouped[activeKind], groupMode[activeKind] ?? 'chronological', activeKind).map((g, gi) => {
              // When a group has 1 signal, render as a regular SignalRow.
              // When a group has many signals, render a "group header" row with `label × N`
              // that expands to show its children.
              if (g.signals.length === 1) {
                const key = `${activeKind}-${gi}`
                return (
                  <SignalRow
                    key={key}
                    signal={g.signals[0]!}
                    expanded={expandedKey === key}
                    onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
                    onHoverGeometry={handleHover}
                  />
                )
              }
              const key = `${activeKind}-group-${gi}`
              const isOpen = expandedKey === key
              return (
                <li
                  key={key}
                  aria-expanded={isOpen}
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                  style={{
                    padding: '6px 8px',
                    borderTop: '1px solid #1a1a1a',
                    fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                    fontSize: '11px',
                    cursor: 'pointer',
                    userSelect: 'none' as const,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#888', width: '10px' }}>{isOpen ? '▼' : '▶'}</span>
                    <span><strong>{g.label}</strong> ×{g.count}</span>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a', paddingLeft: '8px' }}>
                      {g.signals.slice(0, 20).map((s, si) => (
                        <div key={si} style={{ padding: '2px 0' }}>
                          <SummaryLine signal={s} />
                        </div>
                      ))}
                      {g.signals.length > 20 && (
                        <div style={{ color: '#888', marginTop: '4px' }}>+ {g.signals.length - 20} more</div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
```

Above the `Panel` body, add new state hook (right after the existing `useState` for `expandedKey`):

```tsx
  const [groupMode, setGroupMode] = useState<Partial<Record<SignalKind, GroupMode>>>({})
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/ui/tests/panel.test.tsx`
Expected: All tests pass (was 145, +3 new = 148).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 148 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/panel.tsx packages/ui/tests/panel.test.tsx
git commit -m "feat(ui): grouping toggle (render by component, forced-reflow by source)"
```

---

## Task 4: Final verification + README update

**Files:**
- Modify: `packages/ui/README.md`

- [ ] **Step 1: Add a "What's in the panel" section to UI README**

In `packages/ui/README.md`, after the existing `## Quickstart` section, add a new section before `## API`:

```markdown
## What's in the panel

Click any row to expand its detail. Each signal kind shows different info:

- **forced-reflow** — call stack (top 8 frames) showing where the layout was forced
- **layout-shift** — CLS value + each source rect's x/y/w/h
- **long-task** — start/end/duration, plus call stack if captured
- **network** — full URL, transfer size, render-blocking flag
- **paint** — paint name (first-paint / first-contentful-paint)
- **web-vital** — metric name, value with unit, rating (good/needs/poor) dot per [Google thresholds](https://web.dev/vitals/)
- **render** — component, reason, duration, timestamp

The `render` tab also offers **Group by component** (collapsing many commits of the same component into one row); the `forced-reflow` tab offers **Group by source** (grouping reflows by their originating call site).
```

- [ ] **Step 2: Tests still pass**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 148 tests pass, typecheck clean, all 6 packages build.

- [ ] **Step 3: Browser smoke test via the example**

The user will run the dev server and verify visually. We don't automate this; the test suite covers behaviour.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/README.md
git commit -m "docs(ui): document panel detail expansion, ratings, and grouping"
```

---

## Phase 7 Acceptance Criteria

After all 4 tasks complete:

- [ ] On branch `phase-7-panel-v2`
- [ ] `pnpm test` passes 100% (148 tests; +12 over Phase 6)
- [ ] `pnpm typecheck` clean across all 6 packages
- [ ] `pnpm build` produces dist/ for all 6 packages with lib refs
- [ ] Clicking a signal row expands a detail card per signal kind
- [ ] web-vital values show units (ms / dimensionless) and a rating dot
- [ ] long-task duration is color-coded by severity (50–100ms medium, >100ms high)
- [ ] render tab has Group by component option; forced-reflow tab has Group by source
- [ ] Browser demo: every collector's data is visible and useful

## Next Phase Preview (Phase 8+)

- Source-map resolution applied to stack frames in the UI (currently raw `file:line:col`)
- Layout-shift node identification (currently just rects — would need DOM querying or stored selector)
- Timeline view: stacked bar chart of all signals over the recording window
- Save / export recording (JSON)
- Theme toggle (light mode)
- Real React end-to-end integration test in `@react-perfscope/react`
