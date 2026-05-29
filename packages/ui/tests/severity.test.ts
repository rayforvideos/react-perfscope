import { describe, it, expect } from 'vitest'
import {
  severityForSignal,
  worstSeverity,
  webVitalRating,
  severityRank,
} from '../src/severity'
import type { Signal } from '@react-perfscope/core'

function mkLongTask(duration: number): Signal {
  return { kind: 'long-task', at: 0, duration, stack: [] }
}
function mkLayoutShift(value: number): Signal {
  return { kind: 'layout-shift', at: 0, value, sources: [] }
}
function mkRender(duration: number): Signal {
  return { kind: 'render', at: 0, component: 'X', reason: 'r', duration }
}
function mkNetwork(duration: number, blocking = false): Signal {
  return { kind: 'network', url: 'x', startedAt: 0, duration, size: 0, blocking }
}
function mkForcedReflow(duration: number): Signal {
  return { kind: 'forced-reflow', at: 0, duration, stack: [] }
}

describe('severity', () => {
  it('grades long-task by duration buckets', () => {
    expect(severityForSignal(mkLongTask(20))).toBe('low')
    expect(severityForSignal(mkLongTask(60))).toBe('medium')
    expect(severityForSignal(mkLongTask(150))).toBe('high')
  })

  it('grades layout-shift by CLS value', () => {
    expect(severityForSignal(mkLayoutShift(0.01))).toBe('low')
    expect(severityForSignal(mkLayoutShift(0.07))).toBe('medium')
    expect(severityForSignal(mkLayoutShift(0.2))).toBe('high')
  })

  it('grades render by frame-budget multiples', () => {
    expect(severityForSignal(mkRender(8))).toBe('low')
    expect(severityForSignal(mkRender(20))).toBe('medium')
    expect(severityForSignal(mkRender(40))).toBe('high')
  })

  it('grades forced-reflow by duration buckets', () => {
    expect(severityForSignal(mkForcedReflow(2))).toBe('low')
    expect(severityForSignal(mkForcedReflow(10))).toBe('medium')
    expect(severityForSignal(mkForcedReflow(30))).toBe('high')
  })

  it('grades network by duration and blocking', () => {
    expect(severityForSignal(mkNetwork(100))).toBe('low')
    expect(severityForSignal(mkNetwork(700))).toBe('medium')
    expect(severityForSignal(mkNetwork(1500))).toBe('high')
    expect(severityForSignal(mkNetwork(600, true))).toBe('high')
  })

  it('grades web-vital via rating', () => {
    expect(severityForSignal({ kind: 'web-vital', name: 'LCP', value: 2000 })).toBe('low')
    expect(severityForSignal({ kind: 'web-vital', name: 'LCP', value: 3000 })).toBe('medium')
    expect(severityForSignal({ kind: 'web-vital', name: 'LCP', value: 5000 })).toBe('high')
  })

  it('webVitalRating applies Google thresholds', () => {
    expect(webVitalRating('CLS', 0.05)).toBe('good')
    expect(webVitalRating('CLS', 0.15)).toBe('needs')
    expect(webVitalRating('CLS', 0.3)).toBe('poor')
  })

  it('worstSeverity returns highest among signals', () => {
    expect(worstSeverity([mkLongTask(20), mkLongTask(150), mkLongTask(40)])).toBe('high')
    expect(worstSeverity([mkLongTask(60), mkLongTask(40)])).toBe('medium')
    expect(worstSeverity([])).toBe('low')
  })

  it('severityRank orders low < medium < high', () => {
    expect(severityRank('low')).toBeLessThan(severityRank('medium'))
    expect(severityRank('medium')).toBeLessThan(severityRank('high'))
  })
})
