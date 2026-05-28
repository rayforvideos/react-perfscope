import type { Collector, Signal } from '../types'

interface LayoutShiftEntryLike extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
  sources?: { currentRect: DOMRect }[]
}

export function createLayoutShiftCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'layout-shift',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; layout-shift disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const raw of list.getEntries()) {
            const entry = raw as LayoutShiftEntryLike
            if (entry.hadRecentInput) continue
            const sources = (entry.sources ?? []).map((s) => s.currentRect)
            emit({
              kind: 'layout-shift',
              at: entry.startTime,
              value: entry.value,
              sources,
            })
          }
        })
        observer.observe({ type: 'layout-shift', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] layout-shift collector failed to start:', err)
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
