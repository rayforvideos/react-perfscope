import { describe, it, expect } from 'vitest'
import { attachLazyStack } from '../src/sourcemap'

describe('attachLazyStack', () => {
  it('installs `stack` as a getter (not a data property)', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, 'Error\n    at foo (http://x/a.ts:1:1)')
    const desc = Object.getOwnPropertyDescriptor(signal, 'stack')
    expect(desc).toBeDefined()
    expect(typeof desc!.get).toBe('function')
    expect((desc as { value?: unknown }).value).toBeUndefined()
  })

  it('memoizes — repeated access returns the same array reference', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, 'Error\n    at foo (http://x/a.ts:1:1)')
    const s1 = (signal as unknown as { stack: unknown[] }).stack
    const s2 = (signal as unknown as { stack: unknown[] }).stack
    expect(s1).toBe(s2)
  })

  it('produces parsed frames matching parseStack output', () => {
    const raw = `Error
    at doWork (http://localhost:3000/src/app.ts:42:13)`
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, raw)
    expect((signal as unknown as { stack: unknown[] }).stack).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
    ])
  })

  it('handles undefined raw stack (returns empty array)', () => {
    const signal = { kind: 'forced-reflow' as const, at: 1, duration: 2 }
    attachLazyStack(signal, undefined)
    expect((signal as unknown as { stack: unknown[] }).stack).toEqual([])
  })
})
