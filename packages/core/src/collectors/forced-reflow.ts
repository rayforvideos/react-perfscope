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

type OpenGroup = {
  at: number
  duration: number
  count: number
  rawStack: string | undefined
}

// Close the coalescing window at the end of the current synchronous turn.
// queueMicrotask runs after the running task drains, so a layout-thrash loop
// (read offsetWidth N times in one turn) collapses into a single group.
const scheduleFlush: (cb: () => void) => void =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : typeof Promise !== 'undefined'
      ? (cb) => {
          Promise.resolve().then(cb)
        }
      : (cb) => cb()

export function createForcedReflowCollector(): Collector {
  let active = false
  let emit: (s: Signal) => void = () => {}
  const saved: SavedDescriptor[] = []
  let mutationObserver: MutationObserver | null = null
  let group: OpenGroup | null = null

  function consumePendingMutations(): boolean {
    if (!mutationObserver) {
      // Fallback when MutationObserver isn't available: always treat as dirty
      // (Phase 1 over-report behavior).
      return true
    }
    return mutationObserver.takeRecords().length > 0
  }

  function flush() {
    if (!group) return
    const g = group
    group = null
    const signal = {
      kind: 'forced-reflow' as const,
      at: g.at,
      duration: g.duration,
      count: g.count,
    } as unknown as Signal
    attachLazyStack(signal, g.rawStack, 1)
    emit(signal)
  }

  // A layout read happened while recording and layout was dirty. Open a group
  // on the first such read of the turn, then just accumulate count/duration for
  // the rest of the turn. `rawStack` is captured by the caller (the patched
  // accessor) so the stack's top user frame stays at a fixed depth — passing it
  // through a helper would add a frame and misattribute the reflow to this file.
  function record(at: number, duration: number, rawStack: string | undefined) {
    if (group) {
      group.count++
      group.duration += duration
      return
    }
    group = { at, duration, count: 1, rawStack }
    scheduleFlush(flush)
  }

  // True when the next dirty read opens a fresh group and so needs a stack.
  // Lets the accessor skip `new Error().stack` (the dominant cost) on the
  // subsequent reads it coalesces into an already-open group.
  function needsStack(): boolean {
    return group === null
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
          const rawStack = needsStack() ? new Error().stack : undefined
          const at = performance.now()
          const value = originalGet.call(this)
          record(at, performance.now() - at, rawStack)
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
          const rawStack = needsStack() ? new Error().stack : undefined
          const at = performance.now()
          const value = original.apply(this, args)
          record(at, performance.now() - at, rawStack)
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
      // Emit any group still open before the scheduled microtask runs, so the
      // last burst isn't lost when stop() is called mid-turn.
      flush()
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
