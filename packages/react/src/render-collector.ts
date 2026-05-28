import type { Collector, Signal } from '@react-perfscope/core'
import { installDevToolsHook } from './devtools-hook'
import { fiberComponentName, walkChangedFibers } from './fiber-walker'
import type { MinimalFiber } from './types'

export function createRenderCollector(): Collector {
  let active = false
  let emit: (signal: Signal) => void = () => {}
  let unsubscribe: (() => void) | null = null

  function onCommit(root: { current: MinimalFiber }) {
    if (!active) return
    const at = performance.now()
    walkChangedFibers(root.current, (fiber) => {
      // Skip host (DOM) fibers — we only want function/class components in
      // render reports.
      if (typeof fiber.type === 'string') return
      const name = fiberComponentName(fiber)
      if (!name) return
      emit({
        kind: 'render',
        at,
        component: name,
        reason: 'commit',
        duration: 0,
      })
    })
  }

  return {
    kind: 'render',
    activate(emitFn) {
      emit = emitFn
      active = true
      if (unsubscribe) return
      unsubscribe = installDevToolsHook(onCommit)
    },
    deactivate() {
      active = false
      // Keep the global hook listener attached — installDevToolsHook is
      // idempotent and removing it on every deactivate would cost us the
      // ability to re-attach cleanly under the test reset hooks. The
      // `active` flag gates emission.
    },
  }
}
