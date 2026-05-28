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
