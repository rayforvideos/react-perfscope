import { describe, it, expect, afterEach } from 'vitest'
import { showOverlay, hideOverlay, hideAllOverlays } from '../src/overlay'

afterEach(() => {
  hideAllOverlays()
})

describe('overlay primitive', () => {
  it('appends an absolutely-positioned overlay div to document.body', () => {
    showOverlay('test-1', new DOMRect(10, 20, 100, 50))
    const el = document.querySelector('[data-perfscope-overlay="test-1"]') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.style.position).toBe('fixed')
    expect(el.style.left).toBe('10px')
    expect(el.style.top).toBe('20px')
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('50px')
  })

  it('updates the same overlay on repeated show with the same id', () => {
    showOverlay('move', new DOMRect(0, 0, 10, 10))
    showOverlay('move', new DOMRect(100, 100, 200, 200))
    const els = document.querySelectorAll('[data-perfscope-overlay="move"]')
    expect(els).toHaveLength(1)
    expect((els[0] as HTMLElement).style.left).toBe('100px')
  })

  it('hideOverlay starts a fade and removes the named overlay after the transition', async () => {
    showOverlay('a', new DOMRect(0, 0, 10, 10))
    showOverlay('b', new DOMRect(0, 0, 10, 10))
    hideOverlay('a')
    // Immediately after hide: a is still in DOM but opacity is 0
    const a = document.querySelector('[data-perfscope-overlay="a"]') as HTMLElement | null
    expect(a).toBeTruthy()
    expect(a!.style.opacity).toBe('0')
    expect(document.querySelector('[data-perfscope-overlay="b"]')).toBeTruthy()
    // After the transition window, a is removed
    await new Promise((r) => setTimeout(r, 120))
    expect(document.querySelector('[data-perfscope-overlay="a"]')).toBeNull()
    expect(document.querySelector('[data-perfscope-overlay="b"]')).toBeTruthy()
  })

  it('hideAllOverlays clears every overlay', () => {
    showOverlay('a', new DOMRect(0, 0, 10, 10))
    showOverlay('b', new DOMRect(0, 0, 10, 10))
    hideAllOverlays()
    expect(document.querySelectorAll('[data-perfscope-overlay]')).toHaveLength(0)
  })

  it('overlay is non-interactive (pointer-events: none)', () => {
    showOverlay('x', new DOMRect(0, 0, 10, 10))
    const el = document.querySelector('[data-perfscope-overlay="x"]') as HTMLElement
    expect(el.style.pointerEvents).toBe('none')
  })
})
