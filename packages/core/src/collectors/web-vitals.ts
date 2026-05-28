import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'
import type { Collector, Signal, WebVitalSignal } from '../types'

type VitalName = WebVitalSignal['name']

export function createWebVitalsCollector(): Collector {
  let active = false
  let subscribed = false
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
      emit = emitFn
      active = true
      if (subscribed) return
      try {
        onLCP(makeHandler('LCP'))
        onINP(makeHandler('INP'))
        onCLS(makeHandler('CLS'))
        onFCP(makeHandler('FCP'))
        onTTFB(makeHandler('TTFB'))
        subscribed = true
      } catch (err) {
        console.warn('[react-perfscope] web-vitals collector failed to subscribe:', err)
        active = false
      }
    },
    deactivate() {
      // The web-vitals library does not expose unsubscribe. We keep the
      // handlers attached and gate emission via `active`. Re-activating
      // updates `emit` without re-subscribing.
      active = false
    },
  }
}
