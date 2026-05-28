import type { Recorder, RecordingResult, Signal } from './types'

export function createRecorder(): Recorder {
  let recording = false
  let startedAt = 0
  let buffer: Signal[] = []

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
    onSignal() {
      return () => {}
    },
  }
}
