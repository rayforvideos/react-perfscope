import type { Collector, Signal } from '../types'

export function createLongTasksCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'long-task',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; long-tasks disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const entry of list.getEntries()) {
            emit({
              kind: 'long-task',
              at: entry.startTime,
              duration: entry.duration,
              stack: [],
            })
          }
        })
        observer.observe({ type: 'longtask', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] long-tasks collector failed to start:', err)
        observer = null
        active = false
      }
    },
    deactivate() {
      active = false
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          // ignore
        }
        observer = null
      }
    },
  }
}
