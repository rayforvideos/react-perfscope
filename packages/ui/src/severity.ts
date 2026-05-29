import type { Signal, SignalKind, WebVitalSignal } from '@react-perfscope/core'

export type Severity = 'low' | 'medium' | 'high'
export type Rating = 'good' | 'needs' | 'poor'

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: '#666',
  medium: '#ff9500',
  high: '#ff3b30',
}

export const RATING_COLOR: Record<Rating, string> = {
  good: '#34c759',
  needs: '#ff9500',
  poor: '#ff3b30',
}

const WEB_VITAL_THRESHOLDS: Record<WebVitalSignal['name'], [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
}

export function webVitalRating(name: WebVitalSignal['name'], value: number): Rating {
  const [good, needs] = WEB_VITAL_THRESHOLDS[name]
  if (value <= good) return 'good'
  if (value <= needs) return 'needs'
  return 'poor'
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }
const RATING_RANK: Record<Rating, number> = { good: 0, needs: 1, poor: 2 }

export function severityForSignal(s: Signal): Severity {
  switch (s.kind) {
    case 'long-task':
      if (s.duration >= 100) return 'high'
      if (s.duration >= 50) return 'medium'
      return 'low'
    case 'forced-reflow':
      if (s.duration >= 20) return 'high'
      if (s.duration >= 5) return 'medium'
      return 'low'
    case 'layout-shift':
      if (s.value >= 0.1) return 'high'
      if (s.value >= 0.05) return 'medium'
      return 'low'
    case 'render':
      // 60fps frame budget = 16.6ms. >1 frame = medium, >2 = high.
      if (s.duration >= 33) return 'high'
      if (s.duration >= 16) return 'medium'
      return 'low'
    case 'network':
      if (s.blocking && s.duration >= 500) return 'high'
      if (s.duration >= 1000) return 'high'
      if (s.duration >= 500) return 'medium'
      return 'low'
    case 'web-vital': {
      const rating = webVitalRating(s.name, s.value)
      return rating === 'poor' ? 'high' : rating === 'needs' ? 'medium' : 'low'
    }
    case 'paint':
      return 'low'
  }
}

export function worstSeverity(signals: Signal[]): Severity {
  let worst: Severity = 'low'
  for (const s of signals) {
    const sev = severityForSignal(s)
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[worst]) worst = sev
  }
  return worst
}

export function severityRank(sev: Severity): number {
  return SEVERITY_RANK[sev]
}

export function ratingRank(r: Rating): number {
  return RATING_RANK[r]
}

export const KIND_LABEL: Record<SignalKind, string> = {
  'forced-reflow': 'forced-reflow',
  'layout-shift': 'layout-shift',
  'long-task': 'long-task',
  'paint': 'paint',
  'network': 'network',
  'web-vital': 'web-vital',
  'render': 'render',
}
