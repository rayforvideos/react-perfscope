import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'
import type { Collector, Signal, WebVitalSignal } from '../types'

type VitalName = WebVitalSignal['name']
type Sink = (name: VitalName, value: number) => void

// The web-vitals library exposes no unsubscribe, and some metrics (LCP, FCP,
// TTFB) only report once per page — so the module subscribes exactly once and
// fans metrics out to whichever collector instances are currently active.
// Per-instance subscriptions would both leak permanent handlers on every new
// recorder and starve later instances of already-finalized metrics.
let subscribed = false
const sinks = new Set<Sink>()

function ensureSubscribed(): boolean {
  if (subscribed) return true
  try {
    const fan = (name: VitalName) => (metric: Metric) => {
      for (const sink of sinks) sink(name, metric.value)
    }
    onLCP(fan('LCP'))
    onINP(fan('INP'))
    onCLS(fan('CLS'))
    onFCP(fan('FCP'))
    onTTFB(fan('TTFB'))
    subscribed = true
  } catch (err) {
    console.warn('[react-perfscope] web-vitals collector failed to subscribe:', err)
  }
  return subscribed
}

export function createWebVitalsCollector(): Collector {
  let emit: (signal: Signal) => void = () => {}
  const sink: Sink = (name, value) => {
    emit({ kind: 'web-vital', name, value })
  }

  return {
    kind: 'web-vital',
    activate(emitFn) {
      if (!ensureSubscribed()) return
      emit = emitFn
      sinks.add(sink)
    },
    deactivate() {
      sinks.delete(sink)
    },
  }
}
