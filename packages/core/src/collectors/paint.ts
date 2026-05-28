import type { Collector, Signal } from '../types'

export function createPaintCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'paint',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; paint disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const entry of list.getEntries()) {
            emit({
              kind: 'paint',
              at: entry.startTime,
              rect: new DOMRect(0, 0, 0, 0),
              cause: 'unknown',
            })
          }
        })
        observer.observe({ type: 'paint', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] paint collector failed to start:', err)
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
