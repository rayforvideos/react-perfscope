import type { Recorder, RecordingResult, Signal } from './types'

const BUFFER_CAP = 10_000

export interface InternalRecorder extends Recorder {
  __push: (signal: Signal) => void
}

export function createRecorder(): InternalRecorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []
  const subscribers = new Set<(s: Signal) => void>()

  function notify(signal: Signal) {
    for (const cb of subscribers) {
      try {
        cb(signal)
      } catch (err) {
        console.warn('[react-perfscope] subscriber threw:', err)
      }
    }
  }

  return {
    start() {
      if (recording) return
      recording = true
      startedAt = performance.now()
      buffer = []
    },
    stop(): RecordingResult {
      if (!recording) {
        return { signals: [], startedAt: 0, duration: 0 }
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
    __push(signal: Signal) {
      if (!recording) return
      buffer.push(signal)
      if (buffer.length > BUFFER_CAP) {
        buffer.splice(0, buffer.length - BUFFER_CAP)
      }
      notify(signal)
    },
  }
}
