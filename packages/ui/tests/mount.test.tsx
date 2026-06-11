import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRecorder } from '@react-perfscope/core'
import { mount } from '../src/mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.shift()!()
  for (const host of Array.from(document.querySelectorAll('[data-perfscope-host]'))) {
    host.remove()
  }
})

describe('mount', () => {
  it('inserts a Shadow Root host into document.body by default', () => {
    const recorder = createRecorder()
    cleanups.push(mount({ recorder }))
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement | null
    expect(host).toBeTruthy()
    expect(host?.parentElement).toBe(document.body)
    expect(host?.shadowRoot).toBeTruthy()
  })

  it('renders a widget button inside the Shadow Root', () => {
    const recorder = createRecorder()
    cleanups.push(mount({ recorder }))
    const host = document.querySelector('[data-perfscope-host]') as HTMLElement
    const btn = host.shadowRoot!.querySelector('button')
    expect(btn).toBeTruthy()
  })

  it('returns an unmount function that removes the host', () => {
    const recorder = createRecorder()
    const unmount = mount({ recorder })
    unmount()
    expect(document.querySelector('[data-perfscope-host]')).toBeNull()
  })

  it('ignores a second mount into the same host instead of stacking widgets', () => {
    const recorder = createRecorder()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cleanups.push(mount({ recorder }))
    cleanups.push(mount({ recorder }))
    expect(document.querySelectorAll('[data-perfscope-host]')).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('allows mounting again after unmount', () => {
    const recorder = createRecorder()
    const unmount = mount({ recorder })
    unmount()
    cleanups.push(mount({ recorder }))
    expect(document.querySelectorAll('[data-perfscope-host]')).toHaveLength(1)
  })

  it('accepts a custom host element', () => {
    const recorder = createRecorder()
    const parent = document.createElement('section')
    document.body.appendChild(parent)
    cleanups.push(mount({ recorder, host: parent }))
    expect(parent.querySelector('[data-perfscope-host]')).toBeTruthy()
    parent.remove()
  })
})
