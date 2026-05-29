import { describe, it, expect } from 'vitest'
import {
  isUserResource,
  attributeWindow,
  attributeLongTaskSignals,
  type ProfilerTrace,
} from '../src/collectors/self-profiling'
import type { Signal } from '../src/types'

const USER = 'http://localhost:5173/src/App.tsx'
const VENDOR = 'http://localhost:5173/node_modules/.vite/deps/react-dom.js'

/**
 * A trace where:
 *  - frame 0 = dispatchDiscreteEvent (vendor, react-dom)
 *  - frame 1 = trigger (user, App.tsx:110)
 *  - frame 2 = Math.sqrt (native, no resource)
 * stacks nest 0 -> 1 -> 2 (leaf). A sample at the Math.sqrt leaf should
 * attribute to `trigger` (the leaf-most USER frame).
 */
function makeTrace(samples: { timestamp: number; stackId?: number }[]): ProfilerTrace {
  return {
    resources: [USER, VENDOR],
    frames: [
      { name: 'dispatchDiscreteEvent', resourceId: 1, line: 100, column: 5 },
      { name: 'trigger', resourceId: 0, line: 110, column: 3 },
      { name: 'sqrt' }, // native, no resourceId
    ],
    stacks: [
      { frameId: 0 },
      { frameId: 1, parentId: 0 },
      { frameId: 2, parentId: 1 },
    ],
    samples,
  }
}

describe('isUserResource', () => {
  it('true for app source under /src', () => {
    expect(isUserResource(USER)).toBe(true)
  })
  it('false for node_modules', () => {
    expect(isUserResource(VENDOR)).toBe(false)
  })
  it('false for vite internals', () => {
    expect(isUserResource('http://localhost:5173/@react-refresh')).toBe(false)
    expect(isUserResource('http://localhost:5173/@vite/client')).toBe(false)
  })
  it('false for empty/undefined', () => {
    expect(isUserResource('')).toBe(false)
    expect(isUserResource(undefined)).toBe(false)
  })
})

describe('attributeWindow', () => {
  it('returns empty when no samples fall in the window', () => {
    const trace = makeTrace([{ timestamp: 50, stackId: 2 }])
    expect(attributeWindow(trace, 1000, 1120)).toEqual([])
  })

  it('attributes leaf native samples to the nearest user ancestor frame', () => {
    const trace = makeTrace([
      { timestamp: 1000, stackId: 2 },
      { timestamp: 1050, stackId: 2 },
      { timestamp: 1100, stackId: 2 },
    ])
    const out = attributeWindow(trace, 1000, 1120)
    expect(out).toHaveLength(1)
    expect(out[0]!.frame.fnName).toBe('trigger')
    expect(out[0]!.frame.file).toBe(USER)
    expect(out[0]!.frame.line).toBe(110)
    expect(out[0]!.sampleCount).toBe(3)
    expect(out[0]!.selfRatio).toBeCloseTo(1)
  })

  it('excludes samples outside [start, end]', () => {
    const trace = makeTrace([
      { timestamp: 999, stackId: 2 }, // before
      { timestamp: 1050, stackId: 2 }, // in
      { timestamp: 1121, stackId: 2 }, // after
    ])
    const out = attributeWindow(trace, 1000, 1120)
    expect(out[0]!.sampleCount).toBe(1)
  })

  it('counts vendor-only samples in the denominator but not as attribution', () => {
    const trace = makeTrace([
      { timestamp: 1000, stackId: 2 }, // -> trigger (user)
      { timestamp: 1050, stackId: 0 }, // dispatchDiscreteEvent only (vendor)
    ])
    const out = attributeWindow(trace, 1000, 1120)
    expect(out).toHaveLength(1)
    expect(out[0]!.frame.fnName).toBe('trigger')
    expect(out[0]!.sampleCount).toBe(1)
    // 1 of 2 in-window samples had a user leaf frame
    expect(out[0]!.selfRatio).toBeCloseTo(0.5)
  })

  it('sorts multiple hot frames by sampleCount desc', () => {
    const trace: ProfilerTrace = {
      resources: [USER],
      frames: [
        { name: 'hot', resourceId: 0, line: 10, column: 1 },
        { name: 'cold', resourceId: 0, line: 20, column: 1 },
      ],
      stacks: [{ frameId: 0 }, { frameId: 1 }],
      samples: [
        { timestamp: 1, stackId: 0 },
        { timestamp: 2, stackId: 0 },
        { timestamp: 3, stackId: 1 },
      ],
    }
    const out = attributeWindow(trace, 0, 10)
    expect(out.map((a) => a.frame.fnName)).toEqual(['hot', 'cold'])
    expect(out[0]!.sampleCount).toBe(2)
    expect(out[1]!.sampleCount).toBe(1)
  })
})

describe('attributeLongTaskSignals', () => {
  it('attaches attribution to long-task signals within their window, leaves others untouched', () => {
    const trace = makeTrace([
      { timestamp: 1000, stackId: 2 },
      { timestamp: 1050, stackId: 2 },
    ])
    const signals: Signal[] = [
      { kind: 'long-task', at: 1000, duration: 120, stack: [] },
      { kind: 'layout-shift', at: 1000, value: 0.1, sources: [] },
    ]
    const out = attributeLongTaskSignals(trace, signals)
    const lt = out[0] as Extract<Signal, { kind: 'long-task' }>
    expect(lt.attribution?.[0]?.frame.fnName).toBe('trigger')
    // non-long-task signal unchanged
    expect(out[1]).toBe(signals[1])
  })

  it('omits attribution when a long task has no in-window user samples', () => {
    const trace = makeTrace([{ timestamp: 1, stackId: 0 }]) // vendor only, out of window
    const signals: Signal[] = [{ kind: 'long-task', at: 5000, duration: 100, stack: [] }]
    const out = attributeLongTaskSignals(trace, signals)
    const lt = out[0] as Extract<Signal, { kind: 'long-task' }>
    expect(lt.attribution).toBeUndefined()
  })
})
