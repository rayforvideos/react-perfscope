import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector } from '@react-perfscope/react'
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
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    mount({ recorder })
    g.__REACT_PERFSCOPE_AUTO_MOUNTED__ = true
  } catch (err) {
    console.warn('[react-perfscope] auto bootstrap failed:', err)
  }
}

bootstrap()
