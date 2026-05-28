import type { Collector, Signal } from '../types'
import { parseStack } from '../sourcemap'

const LAYOUT_GETTERS = [
  'offsetWidth',
  'offsetHeight',
  'offsetLeft',
  'offsetTop',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
] as const

const LAYOUT_METHODS = ['getBoundingClientRect', 'getClientRects'] as const

type SavedDescriptor = {
  proto: object
  key: string
  descriptor: PropertyDescriptor
}

export function createForcedReflowCollector(): Collector {
  let active = false
  let emit: (s: Signal) => void = () => {}
  const saved: SavedDescriptor[] = []

  function patchGetter(proto: object, key: string) {
    if (typeof proto !== 'object' || proto === null) return
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc || !desc.get) return
    saved.push({ proto, key, descriptor: desc })
    const originalGet = desc.get
    Object.defineProperty(proto, key, {
      configurable: true,
      get(this: unknown) {
        if (active) {
          const at = performance.now()
          const stack = parseStack(new Error().stack)
          const value = originalGet.call(this)
          const duration = performance.now() - at
          emit({ kind: 'forced-reflow', at, duration, stack })
          return value
        }
        return originalGet.call(this)
      },
      set: desc.set,
    })
  }

  function patchMethod(proto: object, key: string) {
    if (typeof proto !== 'object' || proto === null) return
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc || typeof desc.value !== 'function') return
    saved.push({ proto, key, descriptor: desc })
    const original = desc.value as (...args: unknown[]) => unknown
    Object.defineProperty(proto, key, {
      configurable: true,
      writable: true,
      value: function patchedLayoutMethod(this: unknown, ...args: unknown[]) {
        if (active) {
          const at = performance.now()
          const stack = parseStack(new Error().stack)
          const value = original.apply(this, args)
          const duration = performance.now() - at
          emit({ kind: 'forced-reflow', at, duration, stack })
          return value
        }
        return original.apply(this, args)
      },
    })
  }

  return {
    kind: 'forced-reflow',
    activate(emitFn) {
      if (active) return
      emit = emitFn
      active = true

      if (typeof HTMLElement !== 'undefined') {
        for (const key of LAYOUT_GETTERS) {
          patchGetter(HTMLElement.prototype, key)
        }
      }
      if (typeof Element !== 'undefined') {
        for (const key of LAYOUT_METHODS) {
          patchMethod(Element.prototype, key)
        }
      }
    },
    deactivate() {
      if (!active) return
      active = false
      for (const { proto, key, descriptor } of saved) {
        Object.defineProperty(proto, key, descriptor)
      }
      saved.length = 0
    },
  }
}
