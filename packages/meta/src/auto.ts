import {
  createRecorder,
  createForcedReflowCollector,
  createLongTasksCollector,
  createLayoutShiftCollector,
  createNetworkCollector,
  createWebVitalsCollector,
  createSelfProfilingCollector,
  createHeapCollector,
  createSourceMapResolver,
} from '@react-perfscope/core'
import { createRenderCollector, installDevToolsHook } from '@react-perfscope/react'
import { mount } from '@react-perfscope/ui'

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

  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
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

    const recorder = createRecorder()
    recorder.use(createForcedReflowCollector())
    recorder.use(createLongTasksCollector())
    recorder.use(createLayoutShiftCollector())
    recorder.use(createNetworkCollector())
    recorder.use(createWebVitalsCollector())
    recorder.use(createRenderCollector())
    const selfProfiler = createSelfProfilingCollector()
    recorder.use(selfProfiler)
    const heap = createHeapCollector()
    recorder.use(heap)
    const resolver = createSourceMapResolver()
    mount({
      recorder,
      resolveFrame: (f) => resolver.resolve(f),
      finalize: (result) => selfProfiler.finalize(result).then((r) => heap.finalize(r)),
    })
    g.__REACT_PERFSCOPE_AUTO_MOUNTED__ = true
  } catch (err) {
    console.warn('[react-perfscope] auto bootstrap failed:', err)
  }
}

bootstrap()
