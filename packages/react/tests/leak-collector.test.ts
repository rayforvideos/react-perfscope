import { describe, it, expect, afterEach, vi } from 'vitest'
import { createLeakCollector } from '../src/leak-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { RecordingResult } from '@react-perfscope/core'

const base: RecordingResult = { signals: [], startedAt: 0, duration: 0 }

describe('leak collector', () => {
  afterEach(() => {
    uninstallDevToolsHook()
    delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('declares kind "leak"', () => {
    expect(createLeakCollector().kind).toBe('leak')
  })

  it('attaches no leakSuspects when nothing unmounted', async () => {
    const c = createLeakCollector()
    c.activate(() => {})
    c.deactivate()
    const out = await c.finalize(base)
    expect(out.leakSuspects).toBeUndefined()
    expect(out).toBe(base)
  })

  it('a second activate() does not orphan the sampling interval', () => {
    vi.useFakeTimers()
    try {
      const c = createLeakCollector()
      c.activate(() => {})
      c.activate(() => {})
      c.deactivate()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores host (DOM tag) fiber unmounts — only components count', async () => {
    const c = createLeakCollector()
    c.activate(() => {})
    const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { onCommitFiberUnmount?: (id: number, f: unknown) => void } })
      .__REACT_DEVTOOLS_GLOBAL_HOOK__
    // A host fiber (string type) must be ignored.
    hook?.onCommitFiberUnmount?.(1, { type: 'div' })
    c.deactivate()
    const out = await c.finalize(base)
    expect(out.leakSuspects).toBeUndefined()
  })
})
