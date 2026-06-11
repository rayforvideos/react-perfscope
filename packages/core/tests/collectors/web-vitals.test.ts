import { describe, it, expect, afterEach, vi } from 'vitest'

type WebVitalCb = (metric: { name: string; value: number }) => void

const subscribers: Record<string, WebVitalCb | undefined> = {}
const subscribeCalls: Record<string, number> = {}

function register(name: string) {
  return (cb: WebVitalCb) => {
    subscribers[name] = cb
    subscribeCalls[name] = (subscribeCalls[name] ?? 0) + 1
  }
}

vi.mock('web-vitals', () => ({
  onLCP: register('LCP'),
  onINP: register('INP'),
  onCLS: register('CLS'),
  onFCP: register('FCP'),
  onTTFB: register('TTFB'),
}))

import { createWebVitalsCollector } from '../../src/collectors/web-vitals'
import type { Signal, WebVitalSignal } from '../../src/types'

// NOTE: the web-vitals library has no unsubscribe, so the collector module
// subscribes at most once per page — `subscribers` entries persist across
// tests by design and must not be cleared between them.

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

  it('does not re-subscribe across deactivate → activate cycles', () => {
    const collector = createWebVitalsCollector()

    // First activation registers subscribers
    collector.activate(() => {})
    expect(subscribers.LCP).toBeDefined()
    const lcpBefore = subscribers.LCP

    // Second activation should NOT re-register (no new onLCP call)
    collector.deactivate()
    collector.activate(() => {})
    const lcpAfter = subscribers.LCP
    expect(lcpAfter).toBe(lcpBefore) // same handler reference (no new subscription)
  })

  it('does not stack permanent subscriptions across collector instances', () => {
    // web-vitals handlers can never be unsubscribed — a fresh collector per
    // recording session must NOT register another permanent set.
    const first = createWebVitalsCollector()
    const firstGot: Signal[] = []
    first.activate((s) => firstGot.push(s))
    const callsAfterFirst = { ...subscribeCalls }

    const second = createWebVitalsCollector()
    const secondGot: Signal[] = []
    second.activate((s) => secondGot.push(s))
    expect(subscribeCalls).toEqual(callsAfterFirst)

    // Both active instances still receive metrics through the shared subscription.
    subscribers.LCP!({ name: 'LCP', value: 2000 })
    expect(firstGot).toHaveLength(1)
    expect(secondGot).toHaveLength(1)

    first.deactivate()
    second.deactivate()
  })

  it('routes signals to the most recent emit after re-activate', () => {
    const collector = createWebVitalsCollector()
    const firstReceived: Signal[] = []
    const secondReceived: Signal[] = []

    collector.activate((s) => firstReceived.push(s))
    collector.deactivate()
    collector.activate((s) => secondReceived.push(s))

    subscribers.LCP!({ name: 'LCP', value: 1234 })
    expect(firstReceived).toHaveLength(0)
    expect(secondReceived).toHaveLength(1)
  })
})
