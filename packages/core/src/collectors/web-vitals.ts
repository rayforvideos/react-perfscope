import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'
import type { Collector, Signal, WebVitalSignal } from '../types'

type VitalName = WebVitalSignal['name']

export function createWebVitalsCollector(): Collector {
  let active = false
  let emit: (signal: Signal) => void = () => {}

  function makeHandler(name: VitalName) {
    return (metric: Metric) => {
      if (!active) return
      emit({ kind: 'web-vital', name, value: metric.value })
    }
  }

  return {
    kind: 'web-vital',
    activate(emitFn) {
      if (active) return
      emit = emitFn
      active = true
      try {
        onLCP(makeHandler('LCP'))
        onINP(makeHandler('INP'))
        onCLS(makeHandler('CLS'))
        onFCP(makeHandler('FCP'))
        onTTFB(makeHandler('TTFB'))
      } catch (err) {
        console.warn('[react-perfscope] web-vitals collector failed to subscribe:', err)
        active = false
      }
    },
    deactivate() {
      // The web-vitals library does not expose unsubscribe; the `active` flag
      // gates emission in the handlers themselves.
      active = false
    },
  }
}
