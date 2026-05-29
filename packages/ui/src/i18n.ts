import { h, createContext, type ComponentChildren } from 'preact'
import { useContext, useState, useCallback, useMemo } from 'preact/hooks'

export type Lang = 'en' | 'ko'

export const STORAGE_KEY = 'react-perfscope-lang'

// Only descriptive UI chrome is translated. Signal-kind identifiers
// (forced-reflow, layout-shift, …), web-vital metric names (LCP, INP, …),
// and units (ms, KB) stay as-is — they are standard web-perf terms.
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
  cause: string
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
  // render insights
  topRenderers: string
  moreComponents: (n: number) => string
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
  cause: 'cause',
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
  topRenderers: 'Top renderers · by total time',
  moreComponents: (n) => `+ ${n} more component${n === 1 ? '' : 's'}`,
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
  cause: '원인',
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
  topRenderers: '상위 렌더러 · 총 시간순',
  moreComponents: (n) => `외 컴포넌트 ${n}개 더`,
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
