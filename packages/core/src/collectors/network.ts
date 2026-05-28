import type { Collector, Signal } from '../types'

interface ResourceTimingLike extends PerformanceEntry {
  transferSize?: number
  renderBlockingStatus?: 'blocking' | 'non-blocking'
}

export function createNetworkCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'network',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; network disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const raw of list.getEntries()) {
            const entry = raw as ResourceTimingLike
            emit({
              kind: 'network',
              url: entry.name,
              startedAt: entry.startTime,
              duration: entry.duration,
              size: entry.transferSize ?? 0,
              blocking: entry.renderBlockingStatus === 'blocking',
            })
          }
        })
        observer.observe({ type: 'resource', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] network collector failed to start:', err)
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
