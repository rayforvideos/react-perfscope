import { describe, it, expect } from 'vitest'
import { createRecorder } from '../src/recorder'

describe('Recorder state machine', () => {
  it('is not recording initially', () => {
    const r = createRecorder()
    expect(r.isRecording()).toBe(false)
  })

  it('isRecording true after start', () => {
    const r = createRecorder()
    r.start()
    expect(r.isRecording()).toBe(true)
  })

  it('isRecording false after stop', () => {
    const r = createRecorder()
    r.start()
    r.stop()
    expect(r.isRecording()).toBe(false)
  })

  it('start is idempotent (does not throw or reset)', () => {
    const r = createRecorder()
    r.start()
    expect(() => r.start()).not.toThrow()
    expect(r.isRecording()).toBe(true)
  })

  it('stop on a non-recording instance returns an empty result without throwing', () => {
    const r = createRecorder()
    const result = r.stop()
    expect(result.signals).toEqual([])
    expect(result.duration).toBe(0)
  })

  it('stop returns a RecordingResult with correct timing', async () => {
    const r = createRecorder()
    const before = performance.now()
    r.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const result = r.stop()
    expect(result.startedAt).toBeGreaterThanOrEqual(before)
    expect(result.duration).toBeGreaterThanOrEqual(15)
  })
})
