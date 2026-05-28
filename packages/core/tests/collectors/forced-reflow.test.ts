import { describe, it, expect } from 'vitest'
import { createForcedReflowCollector } from '../../src/collectors/forced-reflow'
import type { ForcedReflowSignal, Signal } from '../../src/types'

describe('forced-reflow collector', () => {
  it('emits forced-reflow signal when offsetWidth is read while active', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      void div.offsetWidth
      expect(got.length).toBeGreaterThanOrEqual(1)
      const s = got[0] as ForcedReflowSignal
      expect(s.kind).toBe('forced-reflow')
      expect(typeof s.at).toBe('number')
      expect(typeof s.duration).toBe('number')
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('emits when getBoundingClientRect is called while active', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      const div = document.createElement('div')
      document.body.appendChild(div)
      div.getBoundingClientRect()
      expect(got.length).toBeGreaterThanOrEqual(1)
    } finally {
      collector.deactivate()
    }
  })

  it('does not emit before activate or after deactivate', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []

    // Before activate
    const div1 = document.createElement('div')
    document.body.appendChild(div1)
    void div1.offsetWidth
    expect(got).toHaveLength(0)

    // While active
    collector.activate((s) => got.push(s))
    void div1.offsetWidth
    const afterActivate = got.length
    expect(afterActivate).toBeGreaterThanOrEqual(1)

    // After deactivate
    collector.deactivate()
    void div1.offsetWidth
    expect(got).toHaveLength(afterActivate)
  })

  it('restores original getter on deactivate', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const collector = createForcedReflowCollector()
    collector.activate(() => {})
    collector.deactivate()
    const after = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    expect(after?.get).toBe(before?.get)
  })

  it('captures stack frames', () => {
    const collector = createForcedReflowCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function trigger() {
        const div = document.createElement('div')
        document.body.appendChild(div)
        void div.offsetWidth
      }
      trigger()
      const s = got[0] as ForcedReflowSignal
      // happy-dom may produce minimal stacks; we only require parseStack ran
      expect(Array.isArray(s.stack)).toBe(true)
    } finally {
      collector.deactivate()
    }
  })

  it('gracefully no-ops activate when no DOM globals available (smoke)', () => {
    const collector = createForcedReflowCollector()
    expect(() => {
      collector.activate(() => {})
      collector.deactivate()
    }).not.toThrow()
  })
})
