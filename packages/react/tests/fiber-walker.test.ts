import { describe, it, expect } from 'vitest'
import { fiberComponentName, walkChangedFibers } from '../src/fiber-walker'
import type { MinimalFiber } from '../src/types'

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

describe('fiberComponentName', () => {
  it('returns the displayName for function components', () => {
    const fn = function MyComp() { return null }
    ;(fn as { displayName?: string }).displayName = 'MyComponent'
    expect(fiberComponentName(makeFiber(fn))).toBe('MyComponent')
  })

  it('falls back to function.name when displayName missing', () => {
    function PlainComp() { return null }
    expect(fiberComponentName(makeFiber(PlainComp))).toBe('PlainComp')
  })

  it('returns string for host components (DOM tags)', () => {
    expect(fiberComponentName(makeFiber('div'))).toBe('div')
    expect(fiberComponentName(makeFiber('button'))).toBe('button')
  })

  it('returns null for fibers with no recognizable type', () => {
    expect(fiberComponentName(makeFiber(null))).toBe(null)
    expect(fiberComponentName(makeFiber(undefined))).toBe(null)
  })

  it('handles class components via constructor name', () => {
    class FooComponent {
      render() { return null }
    }
    expect(fiberComponentName(makeFiber(FooComponent))).toBe('FooComponent')
  })

  it('handles memo-wrapped components (type.type.displayName)', () => {
    const inner = function InnerFn() { return null }
    ;(inner as { displayName?: string }).displayName = 'InnerNamed'
    const memoWrap = { $$typeof: Symbol.for('react.memo'), type: inner }
    expect(fiberComponentName(makeFiber(memoWrap))).toBe('InnerNamed')
  })

  it('handles forwardRef components (type.render.displayName)', () => {
    const render = function ForwardImpl() { return null }
    ;(render as { displayName?: string }).displayName = 'ForwardedNamed'
    const forwardWrap = { $$typeof: Symbol.for('react.forward_ref'), render }
    expect(fiberComponentName(makeFiber(forwardWrap))).toBe('ForwardedNamed')
  })
})

describe('walkChangedFibers', () => {
  it('visits root and all descendants via child/sibling links', () => {
    const grandchild = makeFiber('span')
    const child = makeFiber('div', { child: grandchild })
    const root = makeFiber('section', { child })
    grandchild.return = child
    child.return = root

    const visited: unknown[] = []
    walkChangedFibers(root, (f) => visited.push(f.type))
    expect(visited).toEqual(['section', 'div', 'span'])
  })

  it('also follows siblings', () => {
    const sibling = makeFiber('em')
    const child = makeFiber('div', { sibling })
    sibling.return = makeFiber('section', { child })
    child.return = sibling.return!

    const visited: unknown[] = []
    walkChangedFibers(child.return!, (f) => visited.push(f.type))
    expect(visited).toEqual(['section', 'div', 'em'])
  })

  it('does not visit beyond a stopAt limit', () => {
    // Make a long linear tree
    let current = makeFiber(0)
    const root = current
    for (let i = 1; i < 50; i++) {
      const next = makeFiber(i, { return: current })
      current.child = next
      current = next
    }
    const visited: unknown[] = []
    walkChangedFibers(root, (f) => visited.push(f.type), { stopAt: 10 })
    expect(visited.length).toBeLessThanOrEqual(10)
  })
})
