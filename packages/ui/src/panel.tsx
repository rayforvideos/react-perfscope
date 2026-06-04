import { h } from 'preact'
import { useState, useMemo, useEffect, useRef } from 'preact/hooks'
import type {
  RecordingResult,
  Signal,
  SignalKind,
  ForcedReflowSignal,
  LayoutShiftSignal,
  LongTaskSignal,
  LongTaskAttribution,
  NetworkSignal,
  RenderSignal,
  InteractionSignal,
  RenderReason,
  WebVitalSignal,
  StackFrame,
} from '@react-perfscope/core'
import type { WidgetPosition } from './types'
import { showOverlay, hideOverlay, hideAllOverlays, showArrow, hideArrow } from './overlay'
import {
  severityForSignal,
  worstSeverity,
  webVitalRating,
  SEVERITY_COLOR,
  SEVERITY_OVERLAY_COLOR,
  RATING_COLOR,
  severityRank,
  type Severity,
  type Rating,
} from './severity'
import { SummaryHeader } from './summary'
import { Timeline } from './timeline'
import { RenderInsights } from './render-insights'
import { signalMatchesFilter } from './filter'
import { useI18n, type Lang, type Strings } from './i18n'

// Render-reason colors. `parent` is amber because it's the avoidable case —
// the component re-rendered only because its parent did, with no prop change.
// `state` is green: it's the intentional root of the cascade. `mount`/`props`
// are neutral/informational.
const RENDER_REASON_COLOR: Record<RenderReason, string> = {
  mount: '#5ac8fa',
  state: '#34c759',
  props: '#8e8e93',
  parent: '#ff9500',
}

function renderReasonLabel(t: Strings, reason: RenderReason): string {
  switch (reason) {
    case 'mount': return t.reasonMounted
    case 'state': return t.reasonState
    case 'props': return t.reasonProps
    case 'parent': return t.reasonParent
  }
}

function RenderReasonTag({ reason, changedProps }: { reason: RenderReason; changedProps?: string[] }) {
  const { t } = useI18n()
  const color = RENDER_REASON_COLOR[reason]
  const label = renderReasonLabel(t, reason)
  const keys = reason === 'props' && changedProps && changedProps.length > 0 ? `: ${changedProps.join(', ')}` : ''
  return (
    <span
      style={{
        color,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        padding: '0 5px',
        fontSize: '10px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}{keys}
    </span>
  )
}

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}

const KIND_ORDER: SignalKind[] = [
  'forced-reflow',
  'layout-shift',
  'long-task',
  'interaction',
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
    'interaction': [] as Signal[],
    'network': [] as Signal[],
    'web-vital': [] as Signal[],
    'render': [] as Signal[],
  } as Record<SignalKind, Signal[]>
  for (const s of signals) acc[s.kind].push(s)
  return acc
}

const WEB_VITAL_UNIT: Record<WebVitalSignal['name'], string> = {
  LCP: 'ms',
  INP: 'ms',
  CLS: '',
  FCP: 'ms',
  TTFB: 'ms',
}

function RatingDot({ rating }: { rating: Rating }) {
  const { t } = useI18n()
  return (
    <span
      data-rating={rating}
      aria-label={t.ratingLabel(rating)}
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

function hexToRgba(hex: string, alpha: number): string {
  // Accepts #rrggbb only. Returns rgba(...) with the requested alpha.
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const v = m[1]!
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatCls(value: number): string {
  if (value === 0) return '0'
  if (value < 0.001) return value.toExponential(2)
  if (value < 0.01) return value.toFixed(4)
  return value.toFixed(3)
}

function summary(s: Signal): string {
  switch (s.kind) {
    case 'forced-reflow':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(2)}ms`
    case 'layout-shift':
      return `@ ${s.at.toFixed(1)}ms • value ${formatCls(s.value)} • ${s.sources.length} source(s)`
    case 'long-task':
      return `@ ${s.at.toFixed(1)}ms • duration ${s.duration.toFixed(1)}ms`
    case 'interaction':
      return `${s.eventType}${s.target ? ` ${s.target}` : ''} • ${s.duration.toFixed(0)}ms`
    case 'network':
      return `${s.url.length > 60 ? s.url.slice(0, 57) + '...' : s.url} • ${s.duration.toFixed(0)}ms${s.blocking ? ' • blocking' : ''}`
    case 'web-vital':
      return `${s.name}: ${s.value.toFixed(2)}`
    case 'render':
      return `${s.component} • ${s.reason} • ${s.duration.toFixed(2)}ms${s.count && s.count > 1 ? ` • ${s.count} components` : ''}`
  }
}

const detailLabelStyle = { color: '#888', marginRight: '6px' } as const
const detailRowStyle = { padding: '2px 0', display: 'flex', gap: '6px' } as const
const monoStyle = {
  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
  fontSize: '11px',
} as const

function LayoutShiftDetail({ s }: { s: LayoutShiftSignal }) {
  const { t } = useI18n()
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.value}</span><span>{s.value.toFixed(4)}</span></div>
      {s.sources.length === 0 ? (
        <div style={{ color: '#666' }}>{t.noSourceRects}</div>
      ) : (
        s.sources.map((r, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            <span style={{ color: '#888' }}>{t.rect} {i + 1}</span>
            <span>x={r.x.toFixed(0)} y={r.y.toFixed(0)} w={r.width.toFixed(0)} h={r.height.toFixed(0)}</span>
          </div>
        ))
      )}
    </div>
  )
}

function NetworkDetail({ s }: { s: NetworkSignal }) {
  const { t } = useI18n()
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={{ ...detailRowStyle, ...monoStyle, wordBreak: 'break-all' as const }}>
        <span>{s.url}</span>
      </div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.started}</span><span>{s.startedAt.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.duration}</span><span>{s.duration.toFixed(0)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.size}</span><span>{(s.size / 1024).toFixed(2)}KB ({s.size} {t.bytes})</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.renderBlocking}</span><span>{s.blocking ? t.yes : t.no}</span></div>
    </div>
  )
}

function WebVitalDetail({ s }: { s: WebVitalSignal }) {
  const { t } = useI18n()
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.metric}</span><span>{s.name}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.value}</span><span>{s.value.toFixed(2)}</span></div>
    </div>
  )
}

function RenderDetail({ s }: { s: RenderSignal }) {
  const { t } = useI18n()
  // Commit signal (carries members): show the whole cascade.
  if (s.members && s.members.length > 0) {
    return (
      <div style={{ paddingLeft: '12px' }}>
        <div style={detailRowStyle}><span style={detailLabelStyle}>{t.duration}</span><span>{s.duration.toFixed(3)}ms</span></div>
        <div style={detailRowStyle}><span style={detailLabelStyle}>{t.at}</span><span>{s.at.toFixed(2)}ms</span></div>
        <div style={{ marginTop: '6px' }}><CascadeMembers members={s.members} /></div>
      </div>
    )
  }
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.component}</span><span>{s.component}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.reason}</span><RenderReasonTag reason={s.reason} changedProps={s.changedProps} /></div>
      {s.reason === 'props' && s.changedProps && s.changedProps.length > 0 && (
        <div style={{ ...detailRowStyle, ...monoStyle }}><span style={detailLabelStyle}>{t.changedProps}</span><span>{s.changedProps.join(', ')}</span></div>
      )}
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.duration}</span><span>{s.duration.toFixed(3)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.at}</span><span>{s.at.toFixed(2)}ms</span></div>
    </div>
  )
}

function StackFrames({
  raw,
  resolveFrame,
  limit = 8,
}: {
  raw: StackFrame[]
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
  limit?: number
}) {
  const { t } = useI18n()
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
    return () => {
      cancelled = true
    }
  }, [raw])

  return (
    <>
      {resolving && (
        <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>
          {t.resolvingSourceMaps}
        </div>
      )}
      {frames.length === 0 ? (
        <div style={{ color: '#666' }}>{t.noStack}</div>
      ) : (
        frames.map((f, i) => (
          <div key={i} style={{ ...detailRowStyle, ...monoStyle }}>
            {f.fnName ? <span>{f.fnName}</span> : <span style={{ color: '#666' }}>{t.anonymous}</span>}
            <span style={{ color: '#888' }}>{f.file}:{f.line}:{f.col}</span>
          </div>
        ))
      )}
    </>
  )
}

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

function HotFunctions({
  attribution,
  resolveFrame,
}: {
  attribution: LongTaskAttribution[]
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  const { t } = useI18n()
  const [frames, setFrames] = useState<StackFrame[]>(attribution.map((a) => a.frame))

  useEffect(() => {
    if (!resolveFrame) return
    let cancelled = false
    Promise.all(attribution.map((a) => resolveFrame(a.frame)))
      .then((resolved) => {
        if (!cancelled) setFrames(resolved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [attribution])

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ ...detailLabelStyle, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', marginBottom: '1px', color: '#ff9f0a' }}>{t.hotFunctions}</div>
      <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>{t.hotFunctionsHint}</div>
      {attribution.map((a, i) => {
        const f = frames[i] ?? a.frame
        const pct = Math.round(a.selfRatio * 100)
        return (
          <div key={i} style={{ ...monoStyle, padding: '3px 0', borderTop: i > 0 ? '1px dashed #1f1f1f' : 'none' }}>
            <div>
              <span style={{ color: '#ff9f0a', fontWeight: 600 }}>{f.fnName || <span style={{ color: '#666' }}>{t.anonymous}</span>}</span>
              <span style={{ color: SEVERITY_COLOR.medium, marginLeft: '6px' }}>{pct}%</span>
              <span style={{ color: '#666', marginLeft: '6px' }}>({a.sampleCount})</span>
            </div>
            <div style={{ color: '#888', wordBreak: 'break-all' as const }}>{f.file}:{f.line}:{f.col}</div>
          </div>
        )
      })}
    </div>
  )
}

function LongTaskDetail({
  s,
  resolveFrame,
}: {
  s: LongTaskSignal
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  const { t } = useI18n()
  const scripts = s.scripts ? [...s.scripts].sort((a, b) => b.duration - a.duration) : []
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.started}</span><span>{s.at.toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.ended}</span><span>{(s.at + s.duration).toFixed(2)}ms</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.duration}</span><span>{s.duration.toFixed(2)}ms</span></div>
      {typeof s.blockingDuration === 'number' && (
        <div style={detailRowStyle}><span style={detailLabelStyle}>{t.blockingTime}</span><span>{s.blockingDuration.toFixed(2)}ms</span></div>
      )}
      {s.attribution !== undefined && s.attribution.length > 0 && (
        <HotFunctions attribution={s.attribution} resolveFrame={resolveFrame} />
      )}
      {s.scripts !== undefined && (
        <div style={{ marginTop: '6px' }}>
          <div style={{ ...detailLabelStyle, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', marginBottom: '4px' }}>{t.scripts}</div>
          {scripts.length === 0 ? (
            <div style={{ color: '#666' }}>{t.noScripts}</div>
          ) : (
            scripts.map((script, i) => (
              <div key={i} style={{ ...monoStyle, padding: '3px 0', borderTop: i > 0 ? '1px dashed #1f1f1f' : 'none' }}>
                <div>
                  <span>{script.sourceFunctionName || <span style={{ color: '#666' }}>{t.anonymous}</span>}</span>
                  <span style={{ color: '#5ac8fa', marginLeft: '6px' }}>{script.invokerType}</span>
                  <span style={{ color: SEVERITY_COLOR.medium, marginLeft: '6px' }}>{script.duration.toFixed(1)}ms</span>
                </div>
                {script.sourceURL && (
                  <div style={{ color: '#888', wordBreak: 'break-all' as const }}>
                    {script.sourceURL}{script.charPosition >= 0 ? `@${script.charPosition}` : ''}
                  </div>
                )}
                {script.invoker && <div style={{ color: '#666' }}>{t.invoker}: {script.invoker}</div>}
              </div>
            ))
          )}
        </div>
      )}
      {s.scripts === undefined && s.stack.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <StackFrames raw={s.stack} resolveFrame={resolveFrame} limit={5} />
        </div>
      )}
    </div>
  )
}

const INTERACTION_PHASE_COLOR = { input: '#8e8e93', processing: '#5ac8fa', presentation: '#34c759' }

function InteractionDetail({
  s,
  resolveFrame,
}: {
  s: InteractionSignal
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  const { t } = useI18n()
  const total = Math.max(s.duration, 1)
  const phases: { label: string; ms: number; color: string }[] = [
    { label: t.inputDelay, ms: s.inputDelay, color: INTERACTION_PHASE_COLOR.input },
    { label: t.processingTime, ms: s.processing, color: INTERACTION_PHASE_COLOR.processing },
    { label: t.presentation, ms: s.presentation, color: INTERACTION_PHASE_COLOR.presentation },
  ]
  return (
    <div style={{ paddingLeft: '12px' }}>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.interactionEvent}</span><span>{s.eventType}{s.target ? ` · ${s.target}` : ''}</span></div>
      <div style={detailRowStyle}><span style={detailLabelStyle}>{t.duration}</span><span>{s.duration.toFixed(0)}ms</span></div>
      <div style={{ display: 'flex', height: '10px', borderRadius: '3px', overflow: 'hidden', margin: '5px 0 7px', background: '#1a1a1a' }}>
        {phases.map((p, i) => (
          <div key={i} style={{ width: `${(p.ms / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      {phases.map((p, i) => (
        <div key={i} style={detailRowStyle}>
          <span style={{ ...detailLabelStyle, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: p.color, flex: '0 0 7px' }} />
            {p.label}
          </span>
          <span>{p.ms.toFixed(0)}ms</span>
        </div>
      ))}
      {s.attribution !== undefined && s.attribution.length > 0 && (
        <HotFunctions attribution={s.attribution} resolveFrame={resolveFrame} />
      )}
    </div>
  )
}

function SignalDetail({
  s,
  resolveFrame,
}: {
  s: Signal
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}) {
  switch (s.kind) {
    case 'forced-reflow': return <ForcedReflowDetail s={s} resolveFrame={resolveFrame} />
    case 'layout-shift': return <LayoutShiftDetail s={s} />
    case 'long-task': return <LongTaskDetail s={s} resolveFrame={resolveFrame} />
    case 'interaction': return <InteractionDetail s={s} resolveFrame={resolveFrame} />
    case 'network': return <NetworkDetail s={s} />
    case 'web-vital': return <WebVitalDetail s={s} />
    case 'render': return <RenderDetail s={s} />
  }
}

function SeverityDot({ sev, title }: { sev: Severity; title?: string }) {
  const { t } = useI18n()
  return (
    <span
      data-severity={sev}
      aria-label={t.severityLabel(sev)}
      title={title ?? sev}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: SEVERITY_COLOR[sev],
        flex: '0 0 8px',
        boxShadow: sev === 'high' ? '0 0 6px rgba(255,59,48,0.6)' : 'none',
      }}
    />
  )
}

function SummaryLine({ signal }: { signal: Signal }) {
  const { t } = useI18n()
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
  const sev = severityForSignal(signal)
  const color = SEVERITY_COLOR[sev]
  if (signal.kind === 'long-task') {
    return (
      <span>
        @ {signal.at.toFixed(1)}ms • duration{' '}
        <span style={{ color }}>{signal.duration.toFixed(1)}ms</span>
      </span>
    )
  }
  if (signal.kind === 'forced-reflow') {
    const count = signal.count ?? 1
    return (
      <span>
        @ {signal.at.toFixed(1)}ms • duration{' '}
        <span style={{ color }}>{signal.duration.toFixed(2)}ms</span>
        {count > 1 && (
          <span style={{ color: '#888' }}> • {t.coalescedReads(count)}</span>
        )}
      </span>
    )
  }
  if (signal.kind === 'layout-shift') {
    return (
      <span>
        @ {signal.at.toFixed(1)}ms • value{' '}
        <span style={{ color }}>{formatCls(signal.value)}</span>
        {' • '}{t.sourceCount(signal.sources.length)}
      </span>
    )
  }
  if (signal.kind === 'render') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <strong>{signal.component}</strong>
        <RenderReasonTag reason={signal.reason} changedProps={signal.changedProps} />
        <span style={{ color }}>{signal.duration.toFixed(2)}ms</span>
        {signal.count && signal.count > 1 && (
          <span style={{ color: '#888' }}>{t.cascadeComponents(signal.count)}</span>
        )}
      </span>
    )
  }
  if (signal.kind === 'network') {
    const url = signal.url.length > 60 ? signal.url.slice(0, 57) + '...' : signal.url
    return (
      <span>
        {url} • <span style={{ color }}>{signal.duration.toFixed(0)}ms</span>
        {signal.blocking && <span style={{ color: SEVERITY_COLOR.high }}> • {t.blocking}</span>}
      </span>
    )
  }
  return <span>{summary(signal)}</span>
}

type GroupMode = 'chronological' | 'component' | 'source' | 'commit'
type SortMode = 'chronological' | 'severity'

function tabSupportsGrouping(kind: SignalKind): boolean {
  return kind === 'render' || kind === 'forced-reflow'
}

function sortSignalsBySeverity(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    const ra = severityRank(severityForSignal(a))
    const rb = severityRank(severityForSignal(b))
    if (rb !== ra) return rb - ra
    return a.kind === 'web-vital' || b.kind === 'web-vital' ? 0 : (('at' in a ? a.at : 0) - ('at' in b ? b.at : 0))
  })
}

interface SignalGroup {
  label: string
  count: number
  signals: Signal[]
}

function downloadRecording(result: RecordingResult): void {
  // Materialise lazy `stack` getters on forced-reflow and long-task signals
  // so JSON.stringify includes the parsed frames.
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
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function groupSignals(signals: Signal[], mode: GroupMode, kind: SignalKind): SignalGroup[] {
  if (mode === 'chronological') {
    return signals.map((s, i) => ({ label: `#${i + 1}`, count: 1, signals: [s] }))
  }
  if (mode === 'component' && kind === 'render') {
    const byName = new Map<string, Signal[]>()
    // Render signals are coalesced per commit; expand members back to
    // per-component rows for this view.
    for (const s of signals) {
      if (s.kind !== 'render') continue
      for (const m of s.members ?? [s]) {
        if (!byName.has(m.component)) byName.set(m.component, [])
        byName.get(m.component)!.push(m)
      }
    }
    return Array.from(byName.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, list]) => ({ label, count: list.length, signals: list }))
  }
  if (mode === 'commit' && kind === 'render') {
    // Each render signal already represents one commit.
    return signals
      .filter((s): s is RenderSignal => s.kind === 'render')
      .sort((a, b) => a.commitId - b.commitId)
      .map((s) => {
        const list = s.members ?? [s]
        return { label: s.component, count: list.length, signals: list }
      })
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
  return signals.map((s, i) => ({ label: `#${i + 1}`, count: 1, signals: [s] }))
}

interface SignalRowProps {
  signal: Signal
  expanded: boolean
  onToggleExpand: () => void
  onHoverGeometry: (signal: LayoutShiftSignal | null) => void
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
}

function SignalRow({ signal, expanded, onToggleExpand, onHoverGeometry, resolveFrame }: SignalRowProps) {
  const hasGeometry = signal.kind === 'layout-shift' && signal.sources.length > 0
  const sev = severityForSignal(signal)
  return (
    <li
      aria-expanded={expanded}
      data-severity={sev}
      onClick={onToggleExpand}
      onMouseEnter={() => {
        if (hasGeometry && signal.kind === 'layout-shift') onHoverGeometry(signal)
      }}
      onMouseLeave={() => {
        if (hasGeometry) onHoverGeometry(null)
      }}
      style={{
        padding: '6px 8px',
        borderTop: '1px solid #1a1a1a',
        borderLeft: `3px solid ${sev === 'low' ? 'transparent' : SEVERITY_COLOR[sev]}`,
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        fontSize: '11px',
        cursor: 'pointer',
        userSelect: 'none' as const,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#888', width: '10px' }}>{expanded ? '▼' : '▶'}</span>
        <SeverityDot sev={sev} />
        <SummaryLine signal={signal} />
      </div>
      {expanded && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a' }}>
          <SignalDetail s={signal} resolveFrame={resolveFrame} />
        </div>
      )}
    </li>
  )
}

function CascadeMembers({ members }: { members: RenderSignal[] }) {
  const minDepth = members.reduce((m, s) => Math.min(m, s.depth), Infinity)
  return (
    <div>
      {members.map((m, i) => {
        const indent = (m.depth - minDepth) * 14
        const isCascade = m.reason === 'parent'
        return (
          <div
            key={i}
            style={{
              marginLeft: `${indent}px`,
              padding: '2px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ color: isCascade ? RENDER_REASON_COLOR.parent : '#555' }}>
              {m.depth > minDepth ? '└' : '•'}
            </span>
            <strong>{m.component}</strong>
            <RenderReasonTag reason={m.reason} changedProps={m.changedProps} />
            <span style={{ color: '#888' }}>{m.duration.toFixed(2)}ms</span>
          </div>
        )
      })}
    </div>
  )
}

type ActiveTab = SignalKind | 'timeline'

function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  const langs: Lang[] = ['en', 'ko']
  const labels: Record<Lang, string> = { en: 'EN', ko: '한' }
  return (
    <div
      role="group"
      aria-label={t.language}
      style={{
        display: 'inline-flex',
        border: '1px solid #2a2a2a',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      {langs.map((l) => {
        const active = lang === l
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            data-lang={l}
            onClick={() => setLang(l)}
            style={{
              background: active ? '#2a2a2a' : 'transparent',
              color: active ? '#e6e6e6' : '#888',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '2px 8px',
              fontWeight: active ? 600 : 400,
            }}
          >
            {labels[l]}
          </button>
        )
      })}
    </div>
  )
}

export function Panel(props: PanelProps) {
  const { result, onClose, position = 'bottom-right', resolveFrame } = props
  const { t } = useI18n()
  const grouped = useMemo(() => groupByKind(result.signals), [result.signals])
  const kindsPresent = KIND_ORDER.filter((k) => grouped[k].length > 0)
  const hasTimelineSignals =
    result.signals.some((s) => s.kind !== 'web-vital') ||
    (result.heapSamples?.length ?? 0) > 0 ||
    (result.frames?.length ?? 0) > 0
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    kindsPresent[0] ?? 'forced-reflow',
  )
  const activeKind: SignalKind | null = activeTab === 'timeline' ? null : activeTab
  const setActiveKind = (k: SignalKind) => setActiveTab(k)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [groupMode, setGroupMode] = useState<Partial<Record<SignalKind, GroupMode>>>({})
  const [sortMode, setSortMode] = useState<Partial<Record<SignalKind, SortMode>>>({})
  const [filterText, setFilterText] = useState<Partial<Record<SignalKind, string>>>({})
  const activeOverlayCount = useRef(0)

  useEffect(() => () => hideAllOverlays(), [])

  function handleHover(signal: LayoutShiftSignal | null) {
    if (!signal) {
      for (let i = 0; i < activeOverlayCount.current; i++) {
        hideOverlay(`signal-${i}`)
        hideOverlay(`signal-prev-${i}`)
        hideArrow(`signal-arrow-${i}`)
      }
      activeOverlayCount.current = 0
      return
    }
    const sev = severityForSignal(signal)
    const color = SEVERITY_OVERLAY_COLOR[sev]
    const fillAlpha = sev === 'high' ? 0.2 : sev === 'medium' ? 0.16 : 0.14
    const fillRgba = hexToRgba(color, fillAlpha)
    signal.sources.forEach((r, i) => {
      // Skip sources with no current geometry — these typically represent
      // detached/removed nodes. Drawing an overlay (or worse, an arrow
      // pointing at 0,0) would be confusing noise.
      if (r.width <= 0 || r.height <= 0) return
      showOverlay(`signal-${i}`, r, { border: color, fill: fillRgba })
      const prev = signal.previousSources?.[i] ?? null
      if (prev && prev.width > 0 && prev.height > 0) {
        showOverlay(`signal-prev-${i}`, prev, {
          border: color,
          fill: 'transparent',
          dashed: true,
        })
        const from = { x: prev.x + prev.width / 2, y: prev.y + prev.height / 2 }
        const to = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        const dx = to.x - from.x
        const dy = to.y - from.y
        if (Math.hypot(dx, dy) > 8) {
          showArrow(`signal-arrow-${i}`, from, to, color)
        }
      }
    })
    activeOverlayCount.current = signal.sources.length
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
    <div role="region" aria-label={t.panelRegion} style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>react-perfscope</strong>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <LanguageToggle />
          <button
            type="button"
            aria-label={t.saveAria}
            onClick={() => downloadRecording(result)}
            title={t.saveTitle}
            style={{
              background: 'transparent',
              color: '#e6e6e6',
              border: '1px solid #2a2a2a',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '2px 8px',
            }}
          >
            {t.save}
          </button>
          <button
            type="button"
            aria-label={t.closeAria}
            onClick={onClose}
            style={{ background: 'transparent', color: '#e6e6e6', border: 'none', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      </header>

      {kindsPresent.length === 0 && (
        <div style={{ color: '#888' }}>{t.noSignals}</div>
      )}

      {kindsPresent.length > 0 && (
        <>
          <SummaryHeader
            signals={result.signals}
            grouped={grouped}
            kindsPresent={kindsPresent}
            onKindClick={(k) => { setActiveTab(k); setExpandedKey(null) }}
          />
          <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {hasTimelineSignals && (
              <button
                key="timeline"
                type="button"
                data-kind="timeline"
                onClick={() => { setActiveTab('timeline'); setExpandedKey(null) }}
                style={{
                  background: activeTab === 'timeline' ? '#2a2a2a' : '#1a1a1a',
                  color: '#e6e6e6',
                  border: '1px solid #2a2a2a',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {t.timeline}
              </button>
            )}
            {kindsPresent.map((kind) => {
              const worst = worstSeverity(grouped[kind])
              const active = activeKind === kind
              return (
                <button
                  key={kind}
                  type="button"
                  data-kind={kind}
                  data-worst-severity={worst}
                  onClick={() => { setActiveTab(kind); setExpandedKey(null) }}
                  style={{
                    background: active ? '#2a2a2a' : '#1a1a1a',
                    color: '#e6e6e6',
                    border: `1px solid ${worst === 'low' ? '#2a2a2a' : SEVERITY_COLOR[worst]}`,
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {worst !== 'low' && <SeverityDot sev={worst} title={t.worstLabel(worst)} />}
                  {t.kindLabel(kind)} {grouped[kind].length}
                </button>
              )
            })}
          </nav>

          {activeKind && activeTab !== 'timeline' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', fontSize: '11px', color: '#888', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {t.sort}
                <select
                  aria-label={t.sort}
                  value={sortMode[activeKind] ?? 'chronological'}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value as SortMode
                    setSortMode({ ...sortMode, [activeKind]: v })
                    setExpandedKey(null)
                  }}
                  style={{ background: '#1a1a1a', color: '#e6e6e6', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '2px 6px', fontSize: '11px' }}
                >
                  <option value="chronological">{t.sortChronological}</option>
                  <option value="severity">{t.sortSeverity}</option>
                </select>
              </label>
              {tabSupportsGrouping(activeKind) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {t.groupBy}
                  <select
                    aria-label={t.groupBy}
                    value={groupMode[activeKind] ?? 'chronological'}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value as GroupMode
                      setGroupMode({ ...groupMode, [activeKind]: v })
                      setExpandedKey(null)
                    }}
                    style={{ background: '#1a1a1a', color: '#e6e6e6', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '2px 6px', fontSize: '11px' }}
                  >
                    <option value="chronological">{t.groupChronological}</option>
                    {activeKind === 'render' && <option value="commit">{t.groupCommit}</option>}
                    {activeKind === 'render' && <option value="component">{t.groupComponent}</option>}
                    {activeKind === 'forced-reflow' && <option value="source">{t.groupSource}</option>}
                  </select>
                </label>
              )}
              <input
                type="text"
                aria-label={t.filterAria}
                placeholder={t.filterPlaceholder}
                value={filterText[activeKind] ?? ''}
                onInput={(e) => {
                  setFilterText({ ...filterText, [activeKind]: (e.target as HTMLInputElement).value })
                  setExpandedKey(null)
                }}
                style={{ marginLeft: 'auto', background: '#1a1a1a', color: '#e6e6e6', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '120px' }}
              />
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ flexGrow: 1, overflowY: 'auto', paddingTop: '4px', paddingBottom: '24px' }}>
              <Timeline
                signals={result.signals}
                duration={result.duration}
                startedAt={result.startedAt}
                heapSamples={result.heapSamples}
                frames={result.frames}
                onJump={(s) => {
                  setActiveTab(s.kind)
                  const inOrder = grouped[s.kind]
                  const idx = inOrder.indexOf(s)
                  if (idx >= 0) setExpandedKey(`${s.kind}-${idx}`)
                }}
              />
            </div>
          )}
          {activeKind === 'render' && activeTab !== 'timeline' && (
            <RenderInsights
              signals={grouped.render
                .flatMap((s) => (s.kind === 'render' ? s.members ?? [s] : []))
                .filter((s) => signalMatchesFilter(s, filterText.render ?? ''))}
              onSelect={() => {
                setGroupMode({ ...groupMode, render: 'component' })
                setExpandedKey(null)
              }}
            />
          )}
          {activeKind === 'interaction' && activeTab !== 'timeline' && (
            <div
              style={{
                padding: '6px 8px',
                marginBottom: '6px',
                fontSize: '11px',
                color: '#888',
                background: '#141414',
                border: '1px solid #1f1f1f',
                borderRadius: '6px',
              }}
            >
              {t.interactionThresholdHint}
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flexGrow: 1, display: activeTab === 'timeline' ? 'none' : undefined }}>
            {activeKind && (() => {
              const filtered = grouped[activeKind].filter((s) =>
                signalMatchesFilter(s, filterText[activeKind] ?? ''),
              )
              const baseSignals = (sortMode[activeKind] ?? 'chronological') === 'severity'
                ? sortSignalsBySeverity(filtered)
                : filtered
              return groupSignals(baseSignals, groupMode[activeKind] ?? 'chronological', activeKind)
            })().map((g, gi) => {
              const currentMode = groupMode[activeKind] ?? 'chronological'
              if (currentMode === 'chronological') {
                const key = `${activeKind}-${gi}`
                return (
                  <SignalRow
                    key={key}
                    signal={g.signals[0]!}
                    expanded={expandedKey === key}
                    onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
                    onHoverGeometry={handleHover}
                    resolveFrame={resolveFrame}
                  />
                )
              }
              const key = `${activeKind}-group-${gi}`
              const isOpen = expandedKey === key
              const isCascade = activeKind === 'render' && currentMode === 'commit'
              const renderMembers = g.signals.filter((s): s is RenderSignal => s.kind === 'render')
              const unnecessary = isCascade ? renderMembers.filter((s) => s.reason === 'parent').length : 0
              return (
                <li
                  key={key}
                  aria-expanded={isOpen}
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                  style={{
                    padding: '6px 8px',
                    borderTop: '1px solid #1a1a1a',
                    borderLeft: unnecessary > 0 ? `3px solid ${RENDER_REASON_COLOR.parent}` : undefined,
                    fontFamily: 'SF Mono, Menlo, Consolas, monospace',
                    fontSize: '11px',
                    cursor: 'pointer',
                    userSelect: 'none' as const,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#888', width: '10px' }}>{isOpen ? '▼' : '▶'}</span>
                    <span><strong>{g.label}</strong> ×{g.count}</span>
                    {isCascade && unnecessary > 0 && (
                      <span style={{ color: RENDER_REASON_COLOR.parent, fontSize: '10px' }}>
                        ⚠ {t.unnecessaryRenders(unnecessary)}
                      </span>
                    )}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #2a2a2a', paddingLeft: '8px' }}>
                      {isCascade ? (
                        <CascadeMembers members={renderMembers} />
                      ) : (
                        <>
                          {g.signals.slice(0, 20).map((s, si) => (
                            <div key={si} style={{ padding: '2px 0' }}>
                              <SummaryLine signal={s} />
                            </div>
                          ))}
                          {g.signals.length > 20 && (
                            <div style={{ color: '#888', marginTop: '4px' }}>{t.moreItems(g.signals.length - 20)}</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {activeKind &&
            activeTab !== 'timeline' &&
            (filterText[activeKind] ?? '').trim() !== '' &&
            grouped[activeKind].length > 0 &&
            grouped[activeKind].every((s) => !signalMatchesFilter(s, filterText[activeKind] ?? '')) && (
              <div style={{ padding: '12px 8px', fontSize: '11px', color: '#888' }}>
                {t.filterNoMatches}
              </div>
            )}
        </>
      )}
    </div>
  )
}
