import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRenderCollector } from '../src/render-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { Signal, RenderSignal } from '@react-perfscope/core'
import type { MinimalFiber, ReactDevToolsHook } from '../src/types'

beforeEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

function fireCommit(root: MinimalFiber) {
  const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  hook?.onCommitFiberRoot?.(1, { current: root })
}

function makeFiber(type: unknown, opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    ...opts,
  } as MinimalFiber
}

describe('render collector', () => {
  it('reports kind: "render"', () => {
    const collector = createRenderCollector()
    expect(collector.kind).toBe('render')
  })

  it('emits RenderSignal for each named component on commit', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      function Bar() { return null }
      const fooFiber = makeFiber(Foo)
      const barFiber = makeFiber(Bar, { return: fooFiber })
      fooFiber.child = barFiber
      fireCommit(fooFiber)
      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('Foo')
      expect(names).toContain('Bar')
    } finally {
      collector.deactivate()
    }
  })

  it('skips host fibers (DOM tags) when emitting renders', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function App() { return null }
      const appFiber = makeFiber(App)
      const divFiber = makeFiber('div', { return: appFiber })
      appFiber.child = divFiber
      fireCommit(appFiber)
      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('App')
      expect(names).not.toContain('div')
    } finally {
      collector.deactivate()
    }
  })

  it('does not emit when not active', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    collector.deactivate()
    function Foo() { return null }
    fireCommit(makeFiber(Foo))
    expect(got).toHaveLength(0)
  })

  it('sets at to a number and duration to 0 (Phase 3 placeholder)', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      fireCommit(makeFiber(Foo))
      const s = got[0] as RenderSignal
      expect(typeof s.at).toBe('number')
      expect(s.duration).toBe(0)
      expect(typeof s.reason).toBe('string')
    } finally {
      collector.deactivate()
    }
  })

  it('reactivate after deactivate continues to work (single global hook)', () => {
    const collector = createRenderCollector()
    const first: Signal[] = []
    collector.activate((s) => first.push(s))
    collector.deactivate()
    const second: Signal[] = []
    collector.activate((s) => second.push(s))
    try {
      function Foo() { return null }
      fireCommit(makeFiber(Foo))
      expect(first).toHaveLength(0)
      expect(second.length).toBeGreaterThanOrEqual(1)
    } finally {
      collector.deactivate()
    }
  })

  it('uses fiber.actualDuration when available, otherwise 0', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Foo() { return null }
      function Bar() { return null }
      const fooFiber = makeFiber(Foo, { actualDuration: 7.5 } as Partial<MinimalFiber>)
      const barFiber = makeFiber(Bar, { return: fooFiber } as Partial<MinimalFiber>)
      fooFiber.child = barFiber
      fireCommit(fooFiber)
      const renders = got as RenderSignal[]
      const foo = renders.find((s) => s.component === 'Foo')
      const bar = renders.find((s) => s.component === 'Bar')
      expect(foo?.duration).toBe(7.5)
      expect(bar?.duration).toBe(0)
    } finally {
      collector.deactivate()
    }
  })
})
