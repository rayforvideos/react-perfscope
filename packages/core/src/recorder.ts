import type { Collector, Recorder, RecordingResult, Signal } from './types'

/** Hard cap on retained signals; the oldest are dropped past this. Exported so
 * downstream tests can assert the buffer never grows beyond it. */
export const BUFFER_CAP = 10_000

export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
}

export function createRecorder(): Recorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []
  const subscribers = new Set<(s: Signal) => void>()
  const collectors: Collector[] = []

  function notify(signal: Signal) {
    for (const cb of subscribers) {
      try {
        cb(signal)
      } catch (err) {
        console.warn('[react-perfscope] subscriber threw:', err)
      }
    }
  }

  function push(signal: Signal) {
    if (!recording) return
    buffer.push(signal)
    if (buffer.length > BUFFER_CAP) {
      buffer.splice(0, buffer.length - BUFFER_CAP)
    }
    notify(signal)
  }

  const recorder: InternalRecorder = {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
      for (const c of collectors) {
        try {
          c.activate(push)
        } catch (err) {
          console.warn(`[react-perfscope] collector ${c.kind} failed to activate:`, err)
        }
      }
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
      }
      for (const c of collectors) {
        try {
          c.deactivate()
        } catch (err) {
          console.warn(`[react-perfscope] collector ${c.kind} failed to deactivate:`, err)
        }
      }
      const duration = performance.now() - startedAt
      const result: RecordingResult = {
        signals: buffer.slice(),
        startedAt,
        duration,
      }
      recording = false
      buffer = []
      return result
    },
    isRecording() {
      return recording
    },
    onSignal(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    use(collector) {
      collectors.push(collector)
    },
    __push: push,
  }
  return recorder
}
