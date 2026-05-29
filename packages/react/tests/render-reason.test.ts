import { describe, it, expect } from 'vitest'
import {
  PERFORMED_WORK,
  didPerformWork,
  subtreeMightHaveRendered,
  changedPropKeys,
  classifyRenderReason,
  nearestComponentAncestor,
} from '../src/render-reason'
import type { MinimalFiber } from '../src/types'

function makeFiber(opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type: function C() { return null },
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    ...opts,
  } as MinimalFiber
}

describe('changedPropKeys', () => {
  it('returns empty when identity-equal', () => {
    const props = { a: 1 }
    expect(changedPropKeys(props, props)).toEqual([])
  })

  it('returns empty when shallow-equal', () => {
    expect(changedPropKeys({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([])
  })

  it('lists keys whose values differ', () => {
    expect(changedPropKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b'])
  })

  it('counts added and removed keys', () => {
    expect(changedPropKeys({ a: 1 }, { a: 1, b: 2 }).sort()).toEqual(['b'])
    expect(changedPropKeys({ a: 1, b: 2 }, { a: 1 }).sort()).toEqual(['b'])
  })

  it('treats null props as empty object', () => {
    expect(changedPropKeys(null, null)).toEqual([])
    expect(changedPropKeys(null, { a: 1 })).toEqual(['a'])
  })
})

describe('didPerformWork', () => {
  it('false for null', () => {
    expect(didPerformWork(null)).toBe(false)
  })

  it('false when flags absent', () => {
    expect(didPerformWork(makeFiber())).toBe(false)
  })

  it('true when PerformedWork bit set', () => {
    expect(didPerformWork(makeFiber({ flags: PERFORMED_WORK } as Partial<MinimalFiber>))).toBe(true)
  })

  it('false when only other flags set', () => {
    expect(didPerformWork(makeFiber({ flags: 0b10 } as Partial<MinimalFiber>))).toBe(false)
  })
})

describe('subtreeMightHaveRendered', () => {
  it('true when subtreeFlags absent (React < 18 fallback — do not prune)', () => {
    expect(subtreeMightHaveRendered(makeFiber())).toBe(true)
  })

  it('true when subtreeFlags carries the PerformedWork bit', () => {
    expect(
      subtreeMightHaveRendered(makeFiber({ subtreeFlags: PERFORMED_WORK } as Partial<MinimalFiber>))
    ).toBe(true)
  })

  it('false when subtreeFlags is present without the PerformedWork bit', () => {
    expect(subtreeMightHaveRendered(makeFiber({ subtreeFlags: 0 } as Partial<MinimalFiber>))).toBe(false)
    expect(
      subtreeMightHaveRendered(makeFiber({ subtreeFlags: 0b10 } as Partial<MinimalFiber>))
    ).toBe(false)
  })
})

describe('classifyRenderReason', () => {
  it('mount when no alternate', () => {
    const f = makeFiber({ alternate: null })
    expect(classifyRenderReason(f).reason).toBe('mount')
  })

  it('props when memoizedProps changed', () => {
    const alt = makeFiber({ memoizedProps: { title: 'a' } })
    const f = makeFiber({ memoizedProps: { title: 'b' }, alternate: alt })
    const r = classifyRenderReason(f)
    expect(r.reason).toBe('props')
    expect(r.changedProps).toEqual(['title'])
  })

  it('state when props unchanged and parent did NOT perform work (cascade root)', () => {
    const parent = makeFiber({ flags: 0 } as Partial<MinimalFiber>)
    const alt = makeFiber({ memoizedProps: { a: 1 } })
    const f = makeFiber({ memoizedProps: { a: 1 }, alternate: alt, return: parent })
    expect(classifyRenderReason(f).reason).toBe('state')
  })

  it('state when props unchanged and no parent', () => {
    const alt = makeFiber({ memoizedProps: { a: 1 } })
    const f = makeFiber({ memoizedProps: { a: 1 }, alternate: alt, return: null })
    expect(classifyRenderReason(f).reason).toBe('state')
  })

  it('parent when props unchanged but parent performed work (cascade victim)', () => {
    const parent = makeFiber({ flags: PERFORMED_WORK } as Partial<MinimalFiber>)
    const alt = makeFiber({ memoizedProps: { a: 1 } })
    const f = makeFiber({ memoizedProps: { a: 1 }, alternate: alt, return: parent })
    expect(classifyRenderReason(f).reason).toBe('parent')
  })

  it('skips host fibers to reach the parent component (cascade victim)', () => {
    // Real fiber trees nest a component inside host (DOM) fibers, so a
    // component's immediate `.return` is a host node, not its parent
    // component. The parent's performed-work must be read past the host.
    const parentComp = makeFiber({ flags: PERFORMED_WORK } as Partial<MinimalFiber>)
    const host = makeFiber({ type: 'div', flags: 0, return: parentComp } as Partial<MinimalFiber>)
    const alt = makeFiber({ memoizedProps: { a: 1 } })
    const f = makeFiber({ memoizedProps: { a: 1 }, alternate: alt, return: host })
    expect(classifyRenderReason(f).reason).toBe('parent')
  })

  it('state when host-wrapped parent component did NOT perform work', () => {
    const parentComp = makeFiber({ flags: 0 } as Partial<MinimalFiber>)
    const host = makeFiber({ type: 'div', flags: PERFORMED_WORK, return: parentComp } as Partial<MinimalFiber>)
    const alt = makeFiber({ memoizedProps: { a: 1 } })
    const f = makeFiber({ memoizedProps: { a: 1 }, alternate: alt, return: host })
    expect(classifyRenderReason(f).reason).toBe('state')
  })
})

describe('nearestComponentAncestor', () => {
  it('returns null when there is no ancestor', () => {
    expect(nearestComponentAncestor(makeFiber({ return: null }))).toBeNull()
  })

  it('skips host fibers and returns the nearest component', () => {
    const comp = makeFiber()
    const host = makeFiber({ type: 'div', return: comp } as Partial<MinimalFiber>)
    const f = makeFiber({ return: host })
    expect(nearestComponentAncestor(f)).toBe(comp)
  })
})
