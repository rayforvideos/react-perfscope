import type { Collector, Signal } from '../types'
import { attachLazyStack } from '../sourcemap'

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
  let mutationObserver: MutationObserver | null = null

  function consumePendingMutations(): boolean {
    if (!mutationObserver) {
      // Fallback when MutationObserver isn't available: always treat as dirty
      // (Phase 1 over-report behavior).
      return true
    }
    return mutationObserver.takeRecords().length > 0
  }

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
          if (!consumePendingMutations()) {
            return originalGet.call(this)
          }
          const at = performance.now()
          const rawStack = new Error().stack
          const value = originalGet.call(this)
          const duration = performance.now() - at
          const signal = { kind: 'forced-reflow' as const, at, duration } as unknown as Signal
          attachLazyStack(signal, rawStack, 1)
          emit(signal)
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
          if (!consumePendingMutations()) {
            return original.apply(this, args)
          }
          const at = performance.now()
          const rawStack = new Error().stack
          const value = original.apply(this, args)
          const duration = performance.now() - at
          const signal = { kind: 'forced-reflow' as const, at, duration } as unknown as Signal
          attachLazyStack(signal, rawStack, 1)
          emit(signal)
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

      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        try {
          mutationObserver = new MutationObserver(() => {})
          mutationObserver.observe(document, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
          })
        } catch (err) {
          console.warn('[react-perfscope] forced-reflow MutationObserver failed:', err)
          mutationObserver = null
        }
      }

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
      if (mutationObserver) {
        try {
          mutationObserver.disconnect()
        } catch {
          // ignore
        }
        mutationObserver = null
      }
      for (const { proto, key, descriptor } of saved) {
        Object.defineProperty(proto, key, descriptor)
      }
      saved.length = 0
    },
  }
}
