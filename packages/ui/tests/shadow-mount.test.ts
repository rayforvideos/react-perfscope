import { describe, it, expect, afterEach } from 'vitest'
import { h } from 'preact'
import { mountShadow } from '../src/shadow-mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) {
    cleanups.shift()!()
  }
  // Defensive: clear any leaked host elements
  for (const host of Array.from(document.querySelectorAll('[data-perfscope-host]'))) {
    host.remove()
  }
})

describe('mountShadow', () => {
  it('creates a host div with an open Shadow Root attached', () => {
    const teardown = mountShadow(h('span', null, 'hello'))
    cleanups.push(teardown)
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement | null
    expect(host).toBeTruthy()
    expect(host?.shadowRoot).toBeTruthy()
    expect(host?.shadowRoot?.mode).toBe('open')
  })

  it('renders the given Preact node inside the Shadow Root', () => {
    const teardown = mountShadow(h('div', { id: 'inner' }, 'hello'))
    cleanups.push(teardown)
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement
    const inner = host.shadowRoot!.querySelector('#inner')
    expect(inner?.textContent).toBe('hello')
  })

  it('teardown removes the host element from the document', () => {
    const teardown = mountShadow(h('span', null, 'goodbye'))
    teardown()
    expect(document.querySelector('[data-perfscope-host]')).toBeNull()
  })

  it('teardown is idempotent (second call is a no-op)', () => {
    const teardown = mountShadow(h('span', null, 'goodbye'))
    teardown()
    expect(() => teardown()).not.toThrow()
  })

  it('mounting twice creates two independent hosts', () => {
    cleanups.push(mountShadow(h('span', null, 'a')))
    cleanups.push(mountShadow(h('span', null, 'b')))
    const hosts = document.querySelectorAll('[data-perfscope-host]')
    expect(hosts).toHaveLength(2)
  })

  it('accepts a custom host element via opts.parent', () => {
    const parent = document.createElement('section')
    document.body.appendChild(parent)
    cleanups.push(mountShadow(h('span', null, 'x'), { parent }))
    expect(parent.querySelector('[data-perfscope-host]')).toBeTruthy()
    parent.remove()
  })
})
