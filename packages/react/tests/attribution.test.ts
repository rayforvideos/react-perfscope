import { describe, it, expect } from 'vitest'
import { resolveComponentFromElement } from '../src/attribution'
import type { MinimalFiber } from '../src/types'

function attachFiberToElement(el: HTMLElement, fiber: MinimalFiber) {
  ;(el as HTMLElement & Record<string, MinimalFiber>)['__reactFiber$test'] = fiber
}

describe('resolveComponentFromElement', () => {
  it('returns the nearest non-host component name', () => {
    function MyButton() { return null }
    const componentFiber: MinimalFiber = {
      stateNode: null,
      type: MyButton,
      return: null,
      child: null,
      sibling: null,
      alternate: null,
    }
    const hostFiber: MinimalFiber = {
      stateNode: null,
      type: 'button',
      return: componentFiber,
      child: null,
      sibling: null,
      alternate: null,
    }
    const el = document.createElement('button')
    attachFiberToElement(el, hostFiber)
    expect(resolveComponentFromElement(el)).toBe('MyButton')
  })

  it('returns the host tag if no parent component fiber exists', () => {
    const hostFiber: MinimalFiber = {
      stateNode: null,
      type: 'div',
      return: null,
      child: null,
      sibling: null,
      alternate: null,
    }
    const el = document.createElement('div')
    attachFiberToElement(el, hostFiber)
    expect(resolveComponentFromElement(el)).toBe('div')
  })

  it('returns null when no fiber is attached', () => {
    const el = document.createElement('div')
    expect(resolveComponentFromElement(el)).toBe(null)
  })

  it('walks past multiple host fibers to find component', () => {
    function Wrapper() { return null }
    const compFiber: MinimalFiber = {
      stateNode: null, type: Wrapper, return: null, child: null, sibling: null, alternate: null,
    }
    const hostA: MinimalFiber = {
      stateNode: null, type: 'section', return: compFiber, child: null, sibling: null, alternate: null,
    }
    const hostB: MinimalFiber = {
      stateNode: null, type: 'div', return: hostA, child: null, sibling: null, alternate: null,
    }
    const hostC: MinimalFiber = {
      stateNode: null, type: 'span', return: hostB, child: null, sibling: null, alternate: null,
    }
    const el = document.createElement('span')
    attachFiberToElement(el, hostC)
    expect(resolveComponentFromElement(el)).toBe('Wrapper')
  })
})
