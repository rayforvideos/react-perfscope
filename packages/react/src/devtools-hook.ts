import type { MinimalFiber, ReactDevToolsHook } from './types'

type CommitListener = (root: { current: MinimalFiber }, rendererId: number) => void

const HOOK_KEY = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

interface GlobalWithHook {
  [HOOK_KEY]?: ReactDevToolsHook
}

const listeners = new Set<CommitListener>()
let ourHook: ReactDevToolsHook | null = null
let chainedOriginal: ReactDevToolsHook['onCommitFiberRoot'] | null = null

function ensureHookInstalled(): void {
  const g = globalThis as GlobalWithHook
  // Already ours and still installed — nothing to do.
  if (ourHook && g[HOOK_KEY] === ourHook) return

  const existing = g[HOOK_KEY]
  chainedOriginal =
    existing && existing !== ourHook && typeof existing.onCommitFiberRoot === 'function'
      ? existing.onCommitFiberRoot
      : null

  const hook: ReactDevToolsHook = existing && existing !== ourHook ? existing : {}
  hook.onCommitFiberRoot = (rendererId, root, priorityLevel) => {
    if (chainedOriginal) {
      try {
        chainedOriginal(rendererId, root, priorityLevel)
      } catch (err) {
        console.warn('[react-perfscope] chained DevTools hook threw:', err)
      }
    }
    for (const cb of listeners) {
      try {
        cb(root, rendererId)
      } catch (err) {
        console.warn('[react-perfscope] commit listener threw:', err)
      }
    }
  }
  g[HOOK_KEY] = hook
  ourHook = hook
}

export function installDevToolsHook(listener: CommitListener): () => void {
  ensureHookInstalled()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clears all listeners and forgets our installed hook reference. Used by
 * tests to fully reset module state. Does NOT remove the hook from
 * globalThis — callers that want a fully clean slate must also
 * `delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__`.
 */
export function uninstallDevToolsHook(): void {
  listeners.clear()
  ourHook = null
  chainedOriginal = null
}
