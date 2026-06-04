import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRenderCollector } from '../src/render-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { Signal, RenderSignal } from '@react-perfscope/core'
import type { MinimalFiber, ReactDevToolsHook } from '../src/types'
import { PERFORMED_WORK } from '../src/render-reason'

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
    flags: PERFORMED_WORK,
    ...opts,
  } as MinimalFiber
}

describe('render collector', () => {
  it('reports kind: "render"', () => {
    const collector = createRenderCollector()
    expect(collector.kind).toBe('render')
  })

  it('emits one commit signal whose members cover each named component', () => {
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
      // One coalesced signal per commit.
      expect(got).toHaveLength(1)
      const commit = got[0] as RenderSignal
      expect(commit.count).toBe(2)
      const names = (commit.members ?? []).map((m) => m.component)
      expect(names).toContain('Foo')
      expect(names).toContain('Bar')
    } finally {
      collector.deactivate()
    }
  })

  it('reports commit duration as the root inclusive time, not the sum of nested fibers', () => {
    // fiber.actualDuration is hierarchical: a parent already includes its
    // children's render time. Summing parent + children double-counts. React's
    // own Profiler reports the root inclusive time (here 5), so should we.
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Parent() { return null }
      function ChildA() { return null }
      function ChildB() { return null }
      const parent = makeFiber(Parent, { actualDuration: 5 })
      const childA = makeFiber(ChildA, { return: parent, actualDuration: 2 })
      const childB = makeFiber(ChildB, { return: parent, actualDuration: 2 })
      parent.child = childA
      childA.sibling = childB
      fireCommit(parent)

      const commit = got[0] as RenderSignal
      expect(commit.duration).toBe(5)
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

  it('skips fibers that did not perform work (bailed out)', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function App() { return null }
      function MemoChild() { return null }
      const appFiber = makeFiber(App)
      const child = makeFiber(MemoChild, { return: appFiber, flags: 0 } as Partial<MinimalFiber>)
      appFiber.child = child
      fireCommit(appFiber)
      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('App')
      expect(names).not.toContain('MemoChild')
    } finally {
      collector.deactivate()
    }
  })

  it('does not descend into a bailed subtree carrying stale PerformedWork flags', () => {
    // Real-world regression: clicking an isolated component (Counter) re-renders
    // only it, but a sibling subtree (CascadeDemo → ExpensiveChild) that mounted
    // long ago keeps PerformedWork set on its leaves forever (React never clears
    // it on bailed-out fibers). The walk must prune at the bailed parent — whose
    // subtreeFlags correctly report no work — so the stale leaves are never
    // reported as phantom renders.
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function App() { return null }
      function Counter() { return null }
      function CascadeDemo() { return null }
      function ExpensiveChild() { return null }

      // App bailed itself (flags 0) but its subtree has work (Counter).
      const appFiber = makeFiber(App, { flags: 0, subtreeFlags: PERFORMED_WORK })
      // Counter genuinely rendered: own flag set, nothing below.
      const counterFiber = makeFiber(Counter, {
        flags: PERFORMED_WORK,
        subtreeFlags: 0,
        return: appFiber,
      })
      // CascadeDemo bailed and was re-cloned this commit: flags AND subtreeFlags
      // both cleared — it correctly reports "no work below me".
      const cascadeFiber = makeFiber(CascadeDemo, {
        flags: 0,
        subtreeFlags: 0,
        return: appFiber,
      })
      // ExpensiveChild was NOT re-cloned, so its PerformedWork flag is stale.
      const staleChild = makeFiber(ExpensiveChild, {
        flags: PERFORMED_WORK,
        subtreeFlags: 0,
        return: cascadeFiber,
      })
      appFiber.child = counterFiber
      counterFiber.sibling = cascadeFiber
      cascadeFiber.child = staleChild
      fireCommit(appFiber)

      const names = (got as RenderSignal[]).map((s) => s.component)
      expect(names).toContain('Counter')
      expect(names).not.toContain('ExpensiveChild')
    } finally {
      collector.deactivate()
    }
  })

  it('labels a cascade: state root + parent-driven victim, shared commitId, increasing depth', () => {
    const collector = createRenderCollector()
    const got: Signal[] = []
    collector.activate((s) => got.push(s))
    try {
      function Root() { return null }
      function Victim() { return null }
      // Root: props identical to its previous render, parent did no work → state root.
      const rootAlt = makeFiber(Root, { memoizedProps: {} })
      const rootFiber = makeFiber(Root, { memoizedProps: {}, alternate: rootAlt })
      // Victim: props identical, but parent (Root) performed work → cascade.
      const victimAlt = makeFiber(Victim, { memoizedProps: {} })
      const victimFiber = makeFiber(Victim, {
        memoizedProps: {},
        alternate: victimAlt,
        return: rootFiber,
      })
      rootFiber.child = victimFiber
      fireCommit(rootFiber)
      const commit = got[0] as RenderSignal
      const members = commit.members ?? []
      const root = members.find((s) => s.component === 'Root')!
      const victim = members.find((s) => s.component === 'Victim')!
      expect(root.reason).toBe('state')
      expect(victim.reason).toBe('parent')
      expect(root.commitId).toBe(victim.commitId)
      expect(root.depth).toBe(0)
      expect(victim.depth).toBe(1)
      // The commit signal adopts the state root as its representative.
      expect(commit.component).toBe('Root')
      expect(commit.reason).toBe('state')
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
      const commit = got[0] as RenderSignal
      const members = commit.members ?? []
      const foo = members.find((s) => s.component === 'Foo')
      const bar = members.find((s) => s.component === 'Bar')
      expect(foo?.duration).toBe(7.5)
      expect(bar?.duration).toBe(0)
      // Commit duration is the total across members.
      expect(commit.duration).toBe(7.5)
    } finally {
      collector.deactivate()
    }
  })
})
