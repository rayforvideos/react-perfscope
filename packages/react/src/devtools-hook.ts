import type { MinimalFiber, ReactDevToolsHook } from './types'

type CommitListener = (root: { current: MinimalFiber }, rendererId: number) => void
type UnmountListener = (fiber: MinimalFiber, rendererId: number) => void

const HOOK_KEY = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

interface GlobalWithHook {
  [HOOK_KEY]?: ReactDevToolsHook
}

type UnmountHandler = (rendererId: number, fiber: MinimalFiber) => void

const listeners = new Set<CommitListener>()
const unmountListeners = new Set<UnmountListener>()
let ourHook: ReactDevToolsHook | null = null
// Our installed wrappers and the handlers they chain to. The chained handlers
// are ALSO captured per-wrapper in closures below — wrappers must never read
// this mutable module state, or an uninstall→reinstall cycle makes the old
// wrapper chain to itself (infinite recursion on every commit). These module
// copies exist only so uninstall can restore the originals onto the hook.
let ourCommitWrapper: ReactDevToolsHook['onCommitFiberRoot'] | null = null
let ourUnmountWrapper: UnmountHandler | null = null
let restoreCommit: ReactDevToolsHook['onCommitFiberRoot'] | null = null
let restoreUnmount: UnmountHandler | null = null

function ensureHookInstalled(): void {
  const g = globalThis as GlobalWithHook
  // Already ours and still installed — nothing to do.
  if (ourHook && g[HOOK_KEY] === ourHook) return

  const existing = g[HOOK_KEY]
  const chainedOriginal =
    existing && existing !== ourHook && typeof existing.onCommitFiberRoot === 'function'
      ? existing.onCommitFiberRoot
      : null
  const existingUnmount =
    existing && existing !== ourHook
      ? (existing as { onCommitFiberUnmount?: unknown }).onCommitFiberUnmount
      : null
  const chainedUnmount =
    typeof existingUnmount === 'function' ? (existingUnmount as UnmountHandler) : null

  const hook: ReactDevToolsHook = existing && existing !== ourHook ? existing : {}
  // React's injectInternals() checks for supportsFiber and calls inject() to
  // get a renderer ID. Without these, React stores injectedHook = null and
  // never calls onCommitFiberRoot on subsequent commits.
  if (!hook.supportsFiber) {
    hook.supportsFiber = true
  }
  if (typeof hook.inject !== 'function') {
    let _nextRendererId = 1
    hook.inject = () => _nextRendererId++
  }
  // Additional fields that React Refresh (@vitejs/plugin-react) accesses on
  // the hook. Without these it throws "Cannot read properties of undefined
  // (reading 'forEach')" at injectIntoGlobalHook. We default each to a safe
  // empty/noop value; if the real React DevTools extension installs later
  // it will overwrite these.
  if (!hook.renderers) {
    ;(hook as Record<string, unknown>).renderers = new Map()
  }
  if (typeof (hook as Record<string, unknown>)['on'] !== 'function') {
    ;(hook as Record<string, unknown>)['on'] = () => {}
  }
  if (typeof (hook as Record<string, unknown>)['off'] !== 'function') {
    ;(hook as Record<string, unknown>)['off'] = () => {}
  }
  if (typeof (hook as Record<string, unknown>)['emit'] !== 'function') {
    ;(hook as Record<string, unknown>)['emit'] = () => {}
  }
  if (typeof (hook as Record<string, unknown>)['sub'] !== 'function') {
    ;(hook as Record<string, unknown>)['sub'] = () => () => {}
  }
  if (typeof (hook as Record<string, unknown>)['checkDCE'] !== 'function') {
    ;(hook as Record<string, unknown>)['checkDCE'] = () => {}
  }
  if (typeof (hook as Record<string, unknown>)['onPostCommitFiberRoot'] !== 'function') {
    ;(hook as Record<string, unknown>)['onPostCommitFiberRoot'] = () => {}
  }
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
  // React calls this for every fiber it unmounts (dev builds). We fan out to
  // unmount listeners (the leak collector) and chain any pre-existing handler
  // (e.g. the React DevTools extension), mirroring onCommitFiberRoot.
  ;(hook as { onCommitFiberUnmount?: UnmountHandler }).onCommitFiberUnmount =
    (rendererId, fiber) => {
      if (chainedUnmount) {
        try {
          chainedUnmount(rendererId, fiber)
        } catch (err) {
          console.warn('[react-perfscope] chained DevTools unmount hook threw:', err)
        }
      }
      for (const cb of unmountListeners) {
        try {
          cb(fiber, rendererId)
        } catch (err) {
          console.warn('[react-perfscope] unmount listener threw:', err)
        }
      }
    }
  g[HOOK_KEY] = hook
  ourHook = hook
  ourCommitWrapper = hook.onCommitFiberRoot
  ourUnmountWrapper = (hook as { onCommitFiberUnmount?: UnmountHandler }).onCommitFiberUnmount ?? null
  restoreCommit = chainedOriginal
  restoreUnmount = chainedUnmount
}

export function installDevToolsHook(listener: CommitListener): () => void {
  ensureHookInstalled()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Subscribe to fiber unmounts. React invokes `onCommitFiberUnmount` for each
 * unmounted fiber in dev builds; the leak collector uses this to track which
 * component instances were torn down. Returns an unsubscribe function.
 */
export function onFiberUnmount(listener: UnmountListener): () => void {
  ensureHookInstalled()
  unmountListeners.add(listener)
  return () => {
    unmountListeners.delete(listener)
  }
}

/**
 * Clears all listeners, detaches our wrappers from the global hook, and
 * restores any pre-existing handlers we chained to (e.g. the React DevTools
 * extension). Does NOT remove the hook object from globalThis — react-dom
 * captured it at module load, so it must stay. Callers that want a fully
 * clean slate must also `delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__`.
 */
export function uninstallDevToolsHook(): void {
  listeners.clear()
  unmountListeners.clear()
  if (ourHook) {
    // Only restore if our wrapper is still the installed handler — someone
    // (e.g. a late-loading DevTools extension) may have replaced it since.
    if (ourHook.onCommitFiberRoot === ourCommitWrapper) {
      if (restoreCommit) ourHook.onCommitFiberRoot = restoreCommit
      else delete ourHook.onCommitFiberRoot
    }
    const h = ourHook as { onCommitFiberUnmount?: UnmountHandler }
    if (h.onCommitFiberUnmount === ourUnmountWrapper) {
      if (restoreUnmount) h.onCommitFiberUnmount = restoreUnmount
      else delete h.onCommitFiberUnmount
    }
  }
  ourHook = null
  ourCommitWrapper = null
  ourUnmountWrapper = null
  restoreCommit = null
  restoreUnmount = null
}
