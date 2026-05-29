import type { Collector, LongTaskScript, Signal } from '../types'

const LOAF = 'long-animation-frame'
const LEGACY = 'longtask'

/** A single script entry inside a Long Animation Frame. */
interface ScriptTiming {
  duration?: number
  invoker?: string
  invokerType?: string
  sourceURL?: string
  sourceFunctionName?: string
  sourceCharPosition?: number
}

interface LoAFEntry extends PerformanceEntry {
  blockingDuration?: number
  scripts?: ScriptTiming[]
}

function supportsLoAF(): boolean {
  const PO = (globalThis as { PerformanceObserver?: { supportedEntryTypes?: readonly string[] } })
    .PerformanceObserver
  const types = PO?.supportedEntryTypes
  return Array.isArray(types) && types.includes(LOAF)
}

function mapScripts(scripts: ScriptTiming[]): LongTaskScript[] {
  return scripts.map((s) => ({
    invokerType: s.invokerType ?? 'unknown',
    invoker: s.invoker ?? '',
    sourceURL: s.sourceURL ?? '',
    sourceFunctionName: s.sourceFunctionName ?? '',
    charPosition: typeof s.sourceCharPosition === 'number' ? s.sourceCharPosition : -1,
    duration: typeof s.duration === 'number' ? s.duration : 0,
  }))
}

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
      const useLoAF = supportsLoAF()
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const entry of list.getEntries()) {
            if (useLoAF) {
              const loaf = entry as LoAFEntry
              const scripts = Array.isArray(loaf.scripts) ? mapScripts(loaf.scripts) : []
              emit({
                kind: 'long-task',
                at: entry.startTime,
                duration: entry.duration,
                stack: [],
                scripts,
                ...(typeof loaf.blockingDuration === 'number'
                  ? { blockingDuration: loaf.blockingDuration }
                  : {}),
              })
            } else {
              emit({
                kind: 'long-task',
                at: entry.startTime,
                duration: entry.duration,
                stack: [],
              })
            }
          }
        })
        observer.observe({ type: useLoAF ? LOAF : LEGACY, buffered: false })
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
