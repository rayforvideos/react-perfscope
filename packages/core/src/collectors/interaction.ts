import type { Collector, InteractionSignal, RecordingResult } from '../types'

/** Event Timing only surfaces events at/over this duration (ms); 40ms keeps
 * trivial interactions out while still catching anything a user would feel. */
const DURATION_THRESHOLD = 40

/** Each buffered entry retains its `target` DOM node, so the buffer must stay
 * bounded even during very long recordings. */
const MAX_ENTRIES = 5000

interface EventTimingEntry extends PerformanceEntry {
  processingStart: number
  processingEnd: number
  interactionId?: number
  target?: unknown
}

function selectorFor(target: unknown): string | undefined {
  const el = target as { tagName?: string; id?: string; className?: unknown } | null
  if (!el || typeof el.tagName !== 'string') return undefined
  let s = el.tagName.toLowerCase()
  if (el.id) s += `#${el.id}`
  else if (typeof el.className === 'string' && el.className.trim()) {
    s += `.${el.className.trim().split(/\s+/)[0]}`
  }
  return s
}

function supportsEventTiming(): boolean {
  const PO = (globalThis as { PerformanceObserver?: { supportedEntryTypes?: readonly string[] } })
    .PerformanceObserver
  const types = PO?.supportedEntryTypes
  // happy-dom / older browsers may not expose supportedEntryTypes; if the
  // observer exists at all we still try, and observe() throwing is caught.
  return !types || types.includes('event')
}

export interface InteractionCollector extends Collector {
  /** Group buffered Event Timing entries into one interaction each and append
   * them to the result. Returns the input untouched when none qualified. */
  finalize(result: RecordingResult): RecordingResult
}

/**
 * Records Event Timing entries during a recording and, on finalize, turns each
 * user interaction (grouped by interactionId) into one signal carrying the INP
 * latency breakdown: input delay → processing → presentation. The longest
 * event in a group defines the interaction's latency (matching how INP is
 * attributed). Emits no live signals — interactions are assembled at finalize,
 * then the self-profiling collector attributes the processing window to the
 * developer's hot functions.
 */
export function createInteractionCollector(): InteractionCollector {
  let active = false
  let observer: PerformanceObserver | null = null
  let entries: EventTimingEntry[] = []

  return {
    kind: 'interaction',
    activate() {
      if (typeof PerformanceObserver === 'undefined' || !supportsEventTiming()) return
      active = true
      entries = []
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const e of list.getEntries()) {
            if (entries.length >= MAX_ENTRIES) break
            entries.push(e as EventTimingEntry)
          }
        })
        // `event` covers all interaction events; `first-input` guarantees the
        // first one even if it's under the duration threshold.
        observer.observe({ type: 'event', buffered: false, durationThreshold: DURATION_THRESHOLD } as PerformanceObserverInit)
        try {
          observer.observe({ type: 'first-input', buffered: false } as PerformanceObserverInit)
        } catch {
          // first-input not supported everywhere; the event stream is enough.
        }
      } catch (err) {
        console.warn('[react-perfscope] interaction collector failed to start:', err)
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
    finalize(result) {
      // Consume the buffer: entries reference `target` DOM nodes, and the
      // recorder finalizes after stop — holding them past this point would
      // pin interacted (possibly detached) elements until the next recording.
      const buffered = entries
      entries = []
      const byId = new Map<number, EventTimingEntry[]>()
      for (const e of buffered) {
        const id = e.interactionId
        if (!id) continue // 0 / undefined → not part of a discrete interaction
        const group = byId.get(id)
        if (group) group.push(e)
        else byId.set(id, [e])
      }
      const interactions: InteractionSignal[] = []
      for (const group of byId.values()) {
        // All events of one interaction (pointerdown/up/click) report the same
        // `duration` (the whole interaction latency), so the breakdown can't
        // come from a single event. Span the processing across the group:
        // earliest processingStart → latest processingEnd (matches web-vitals).
        // The "defining" event for label/target is the one with the most
        // processing — typically the click/keydown that actually ran handlers.
        let duration = 0
        let startTime = Infinity
        let processingStart = Infinity
        let processingEnd = -Infinity
        let defining = group[0]!
        let maxProcessing = -Infinity
        for (const e of group) {
          if (e.duration > duration) duration = e.duration
          if (e.startTime < startTime) startTime = e.startTime
          if (e.processingStart < processingStart) processingStart = e.processingStart
          if (e.processingEnd > processingEnd) processingEnd = e.processingEnd
          const proc = e.processingEnd - e.processingStart
          if (proc > maxProcessing) {
            maxProcessing = proc
            defining = e
          }
        }
        if (duration < DURATION_THRESHOLD) continue
        const inputDelay = Math.max(0, processingStart - startTime)
        const processing = Math.max(0, processingEnd - processingStart)
        const presentation = Math.max(0, startTime + duration - processingEnd)
        interactions.push({
          kind: 'interaction',
          at: startTime,
          eventType: defining.name,
          ...(selectorFor(defining.target) ? { target: selectorFor(defining.target) } : {}),
          duration,
          inputDelay,
          processing,
          presentation,
        })
      }
      if (interactions.length === 0) return result
      interactions.sort((a, b) => a.at - b.at)
      return { ...result, signals: [...result.signals, ...interactions] }
    },
  }
}
