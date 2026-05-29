import { h, createContext, type ComponentChildren } from 'preact'
import { useContext, useState, useCallback, useMemo } from 'preact/hooks'
import type { SignalKind, HeapTrendClass } from '@react-perfscope/core'

export type Lang = 'en' | 'ko'

export const STORAGE_KEY = 'react-perfscope-lang'

// Signal-kind *identifiers* (forced-reflow, layout-shift, …) stay as-is in
// data attributes and internal logic, but their *display* labels go through
// `kindLabel`. Web-vital metric names (LCP, INP, …) and units (ms, KB) are
// never translated — they are standard web-perf terms.
export interface Strings {
  save: string
  saveAria: string
  saveTitle: string
  closeAria: string
  noSignals: string
  sort: string
  sortChronological: string
  sortSeverity: string
  groupBy: string
  groupChronological: string
  groupComponent: string
  groupSource: string
  groupCommit: string
  timeline: string
  // detail labels
  value: string
  started: string
  duration: string
  size: string
  bytes: string
  renderBlocking: string
  metric: string
  component: string
  reason: string
  at: string
  ended: string
  yes: string
  no: string
  rect: string
  noSourceRects: string
  noStack: string
  resolvingSourceMaps: string
  anonymous: string
  blocking: string
  sourceCount: (n: number) => string
  moreItems: (n: number) => string
  // widget
  startRecording: string
  stopRecording: string
  rec: string
  // summary
  signalsTitle: (n: number, kind: string) => string
  // timeline
  noTimeBound: string
  timeAxis: string
  // heap
  heapLabel: string
  heapUnsupported: string
  heapExtensionHint: string
  heapTrendLabel: (cls: HeapTrendClass) => string
  // render insights
  topRenderers: string
  moreComponents: (n: number) => string
  rendererDetail: (component: string, count: number, totalMs: number, maxMs: number) => string
  // aria / tooltips
  language: string
  panelRegion: string
  ratingLabel: (rating: string) => string
  severityLabel: (sev: string) => string
  worstLabel: (sev: string) => string
  // signal-kind display label (identifier stays in data attrs / logic)
  kindLabel: (kind: SignalKind) => string
  // render reasons
  reasonMounted: string
  reasonState: string
  reasonProps: string
  reasonParent: string
  cascadeRoot: string
  changedProps: string
  unnecessaryRenders: (n: number) => string
  // long-task scripts
  scripts: string
  invoker: string
  source: string
  blockingTime: string
  noScripts: string
  hotFunctions: string
  hotFunctionsHint: string
}

const en: Strings = {
  save: 'Save',
  saveAria: 'Save recording',
  saveTitle: 'Save recording as JSON',
  closeAria: 'Close panel',
  noSignals: 'No signals recorded.',
  sort: 'Sort',
  sortChronological: 'chronological',
  sortSeverity: 'severity (worst first)',
  groupBy: 'Group by',
  groupChronological: 'chronological',
  groupComponent: 'component',
  groupSource: 'source',
  groupCommit: 'cascade (commit)',
  timeline: 'timeline',
  value: 'value',
  started: 'started',
  duration: 'duration',
  size: 'size',
  bytes: 'bytes',
  renderBlocking: 'render-blocking',
  metric: 'metric',
  component: 'component',
  reason: 'reason',
  at: 'at',
  ended: 'ended',
  yes: 'yes',
  no: 'no',
  rect: 'rect',
  noSourceRects: 'No source rects.',
  noStack: 'No stack captured.',
  resolvingSourceMaps: 'resolving source maps…',
  anonymous: '(anonymous)',
  blocking: 'blocking',
  sourceCount: (n) => `${n} source(s)`,
  moreItems: (n) => `+ ${n} more`,
  startRecording: 'Start recording',
  stopRecording: 'Stop recording',
  rec: 'rec',
  signalsTitle: (n, kind) => `${n} ${kind} signals`,
  noTimeBound: 'No time-bound signals to plot.',
  timeAxis: 'time',
  heapLabel: 'heap',
  heapUnsupported: 'heap size unavailable (Chromium only)',
  heapExtensionHint:
    'Heap size includes browser extensions injected into the page (e.g. React DevTools), so it can rise even while your app is idle. For app-only measurement, record in an incognito window or a profile with extensions disabled.',
  heapTrendLabel: (cls) =>
    cls === 'leak-suspected' ? 'leak suspected' : cls === 'growing' ? 'growing' : 'stable',
  topRenderers: 'Top renderers · by total time',
  moreComponents: (n) => `+ ${n} more component${n === 1 ? '' : 's'}`,
  rendererDetail: (c, n, total, max) =>
    `${c} · ${n} renders · total ${total.toFixed(1)}ms · max ${max.toFixed(1)}ms`,
  language: 'Language',
  panelRegion: 'react-perfscope panel',
  ratingLabel: (rating) => `rating: ${rating}`,
  severityLabel: (sev) => `severity: ${sev}`,
  worstLabel: (sev) => `worst: ${sev}`,
  kindLabel: (kind) => kind,
  reasonMounted: 'mounted',
  reasonState: 'state changed',
  reasonProps: 'props changed',
  reasonParent: 'parent re-rendered',
  cascadeRoot: 'root',
  changedProps: 'changed',
  unnecessaryRenders: (n) => `${n} unnecessary render${n === 1 ? '' : 's'} (parent-driven)`,
  scripts: 'scripts',
  invoker: 'invoker',
  source: 'source',
  blockingTime: 'blocking',
  noScripts: 'No script attribution (LoAF unsupported).',
  hotFunctions: 'your hot functions',
  hotFunctionsHint: 'sampled time spent in your own source',
}

const KIND_LABELS_KO: Record<SignalKind, string> = {
  render: '렌더',
  'layout-shift': '레이아웃 이동',
  'long-task': '긴 작업',
  'forced-reflow': '강제 리플로우',
  network: '네트워크',
  'web-vital': '웹 바이탈',
}

const ko: Strings = {
  save: '저장',
  saveAria: '녹화 저장',
  saveTitle: '녹화를 JSON으로 저장',
  closeAria: '패널 닫기',
  noSignals: '녹화된 시그널이 없어요.',
  sort: '정렬',
  sortChronological: '시간순',
  sortSeverity: '심각도순 (높은 것부터)',
  groupBy: '그룹화',
  groupChronological: '시간순',
  groupComponent: '컴포넌트',
  groupSource: '소스',
  groupCommit: '연쇄 (커밋)',
  timeline: '타임라인',
  value: '값',
  started: '시작',
  duration: '지속시간',
  size: '크기',
  bytes: '바이트',
  renderBlocking: '렌더 차단',
  metric: '지표',
  component: '컴포넌트',
  reason: '원인',
  at: '시점',
  ended: '종료',
  yes: '예',
  no: '아니오',
  rect: '영역',
  noSourceRects: '소스 영역이 없어요.',
  noStack: '캡처된 스택이 없어요.',
  resolvingSourceMaps: '소스맵 해석 중…',
  anonymous: '(익명)',
  blocking: '차단',
  sourceCount: (n) => `소스 ${n}개`,
  moreItems: (n) => `외 ${n}개 더`,
  startRecording: '녹화 시작',
  stopRecording: '녹화 종료',
  rec: '녹화',
  signalsTitle: (n, kind) => `${kind} 시그널 ${n}개`,
  noTimeBound: '표시할 시간 기반 시그널이 없어요.',
  timeAxis: '시간',
  heapLabel: '힙',
  heapUnsupported: '힙 측정 미지원 (크롬 전용)',
  heapExtensionHint:
    '힙 크기엔 페이지에 주입된 브라우저 확장(예: React DevTools) 메모리도 포함돼요. 그래서 앱이 idle이어도 올라갈 수 있어요. 앱만 정확히 재려면 시크릿 창이나 확장이 꺼진 프로필에서 녹화하세요.',
  heapTrendLabel: (cls) =>
    cls === 'leak-suspected' ? '누수 의심' : cls === 'growing' ? '증가 중' : '안정',
  topRenderers: '상위 렌더러 · 총 시간순',
  moreComponents: (n) => `외 컴포넌트 ${n}개 더`,
  rendererDetail: (c, n, total, max) =>
    `${c} · 렌더 ${n}회 · 총 ${total.toFixed(1)}ms · 최대 ${max.toFixed(1)}ms`,
  language: '언어',
  panelRegion: 'react-perfscope 패널',
  ratingLabel: (rating) => `평가: ${rating}`,
  severityLabel: (sev) => `심각도: ${sev}`,
  worstLabel: (sev) => `가장 심각: ${sev}`,
  kindLabel: (kind) => KIND_LABELS_KO[kind],
  reasonMounted: '마운트됨',
  reasonState: 'state 변경',
  reasonProps: 'props 변경',
  reasonParent: '부모 따라 리렌더',
  cascadeRoot: '시작점',
  changedProps: '변경된 props',
  unnecessaryRenders: (n) => `불필요한 리렌더 ${n}개 (부모 때문에)`,
  scripts: '스크립트',
  invoker: '호출자',
  source: '소스',
  blockingTime: '차단 시간',
  noScripts: '스크립트 출처 없음 (LoAF 미지원).',
  hotFunctions: '내 코드 핫스팟',
  hotFunctionsHint: '내 소스에서 샘플링된 점유 시간',
}

export const STRINGS: Record<Lang, Strings> = { en, ko }

function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'ko'
}

export function readStoredLang(): Lang {
  if (typeof localStorage === 'undefined') return 'en'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

export interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Strings
}

// Default value: English with a no-op setter. Lets components render outside a
// provider (e.g. unit tests) and default to English without crashing.
const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: en,
})

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang())
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, l)
      } catch {
        // ignore persistence failures (private mode, quota, etc.)
      }
    }
  }, [])
  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: STRINGS[lang] }), [lang, setLang])
  return h(I18nContext.Provider, { value }, children)
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
