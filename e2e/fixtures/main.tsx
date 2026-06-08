// Test harness bootstrap. Uses the SAME recorder assembly the product ships
// (createConfiguredRecorder, shared with react-perfscope/auto) so the harness
// can never validate a collector set that differs from what users get. Only
// the UI mount is omitted, and a programmatic API is exposed instead.
//
// Import order matters: the React DevTools global hook must be installed
// BEFORE react-dom is evaluated, because react-dom captures the hook once at
// module-load time. We install it from a static import here, then pull in the
// recorder assembly and the React app via dynamic import so they evaluate
// afterward (neither react-perfscope's meta entry nor the factory imports
// react-dom; only ./app does).
import { installDevToolsHook } from '@react-perfscope/react'

installDevToolsHook(() => {})

async function boot(): Promise<void> {
  const { createConfiguredRecorder, correlate, BUFFER_CAP } = await import('react-perfscope')
  const { mountApp, getCommitDurations, resetCommitDurations } = await import('./app')
  const { startGroundTruth, resetGroundTruth, getGroundTruth } = await import('./ground-truth')
  const { scenarios } = await import('./scenarios')

  const { recorder, finalize } = createConfiguredRecorder()

  startGroundTruth()
  mountApp()

  window.__perfscopeTest = {
    start() {
      recorder.start()
    },
    async stop() {
      const r = await finalize(recorder.stop())
      return {
        signals: r.signals,
        duration: r.duration,
        heapSamples: r.heapSamples,
        frames: r.frames,
        episodes: correlate(r.signals),
      }
    },
    bufferCap: BUFFER_CAP,
    // Wait one frame then `ms` more, so async PerformanceObserver entries
    // (long-task, layout-shift, resource) are delivered before stop().
    settle(ms = 100) {
      return new Promise<void>((res) => requestAnimationFrame(() => setTimeout(res, ms)))
    },
    groundTruth: {
      get: getGroundTruth,
      commitDurations: getCommitDurations,
      reset() {
        resetGroundTruth()
        resetCommitDurations()
      },
    },
    scenarios,
  }
  window.__perfscopeReady = true
}

void boot()
