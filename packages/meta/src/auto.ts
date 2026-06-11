import { createSourceMapResolver } from '@react-perfscope/core'
import { installDevToolsHook } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'
import { createConfiguredRecorder } from './bootstrap'

// Type-only declaration so the guard below can use the bare member expression
// `process.env.NODE_ENV` — the exact token bundlers (Vite define, webpack
// DefinePlugin, esbuild) statically replace. Optional-chained access through
// globalThis is not replaced and browsers have no `process` global, which
// would make the guard a silent no-op in production bundles. The try/catch
// absorbs the ReferenceError when no bundler and no `process` exist.
declare const process: { env: { NODE_ENV?: string } }

/**
 * Side-effect entry. Importing `react-perfscope/auto` bootstraps a Recorder
 * with the render collector and mounts the UI. Idempotent — importing twice
 * is a no-op (the first import wins).
 *
 * Bails when `process.env.NODE_ENV === 'production'` (build plugins also
 * guard against prod, but this is defense-in-depth).
 */
function bootstrap(): void {
  if (typeof globalThis === 'undefined') return
  const g = globalThis as { __REACT_PERFSCOPE_AUTO_MOUNTED__?: boolean }
  if (g.__REACT_PERFSCOPE_AUTO_MOUNTED__) return

  let env: string | undefined
  try {
    env = process.env.NODE_ENV
  } catch {
    env = undefined
  }
  if (env === 'production') return

  if (typeof document === 'undefined') return

  try {
    // Install the React DevTools hook SYNCHRONOUSLY before react-dom is
    // evaluated. react-dom captures `__REACT_DEVTOOLS_GLOBAL_HOOK__` exactly
    // once at module-load time, so the hook must exist by the time the user
    // bundle imports react-dom. A no-op listener is enough to register the
    // hook — when the render collector later activates, it adds the real
    // commit handler to the same global hook.
    installDevToolsHook(() => {})

    const { recorder, finalize } = createConfiguredRecorder()
    const resolver = createSourceMapResolver()
    mount({
      recorder,
      resolveFrame: (f) => resolver.resolve(f),
      finalize,
    })
    g.__REACT_PERFSCOPE_AUTO_MOUNTED__ = true
  } catch (err) {
    console.warn('[react-perfscope] auto bootstrap failed:', err)
  }
}

bootstrap()
