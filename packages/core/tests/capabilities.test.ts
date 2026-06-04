import { describe, it, expect, afterEach } from 'vitest'
import { detectCapabilities, unsupportedKinds } from '../src/capabilities'

const original = (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver

afterEach(() => {
  ;(globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = original
})

function setSupportedEntryTypes(types: readonly string[] | undefined) {
  ;(globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = {
    supportedEntryTypes: types,
  }
}

describe('detectCapabilities', () => {
  it('reports everything supported in a Chromium-like browser', () => {
    setSupportedEntryTypes([
      'longtask',
      'long-animation-frame',
      'layout-shift',
      'event',
      'resource',
      'paint',
    ])
    expect(unsupportedKinds()).toEqual([])
  })

  it('reports Chromium-only kinds unsupported in a Firefox-like browser', () => {
    // Firefox exposes resource/paint/navigation but not longtask, layout-shift,
    // or event timing.
    setSupportedEntryTypes(['resource', 'paint', 'navigation', 'mark', 'measure'])
    const unsupported = unsupportedKinds()
    expect(unsupported).toContain('long-task')
    expect(unsupported).toContain('layout-shift')
    expect(unsupported).toContain('interaction')
    // JS-based and resource-based kinds still work.
    expect(unsupported).not.toContain('render')
    expect(unsupported).not.toContain('forced-reflow')
    expect(unsupported).not.toContain('network')
  })

  it('treats an unknown environment (no supportedEntryTypes) as fully capable', () => {
    setSupportedEntryTypes(undefined)
    expect(unsupportedKinds()).toEqual([])
    expect(detectCapabilities()['long-task']).toBe(true)
  })
})
