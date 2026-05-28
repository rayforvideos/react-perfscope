import { describe, it, expect } from 'vitest'
import { createRecorder } from '../src/recorder'
import type { Signal } from '../src/types'

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

const makeLongTask = (at: number, duration: number): Signal => ({
  kind: 'long-task',
  at,
  duration,
  stack: [],
})

describe('Recorder signal buffering', () => {
  it('buffers signals pushed while recording', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    r.__push(makeLongTask(1, 60))
    r.__push(makeLongTask(2, 80))
    const result = r.stop()
    expect(result.signals).toHaveLength(2)
  })

  it('drops signals pushed while not recording', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.__push(makeLongTask(1, 60))
    r.start()
    r.stop()
    r.__push(makeLongTask(2, 80))
    const result = r.stop()
    expect(result.signals).toEqual([])
  })

  it('clears buffer on next start', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    r.__push(makeLongTask(1, 60))
    r.stop()
    r.start()
    const result = r.stop()
    expect(result.signals).toEqual([])
  })

  it('caps buffer at 10,000 signals (drops oldest)', () => {
    const r = createRecorder() as ReturnType<typeof createRecorder> & {
      __push: (s: Signal) => void
    }
    r.start()
    for (let i = 0; i < 10_005; i++) {
      r.__push(makeLongTask(i, 60))
    }
    const result = r.stop()
    expect(result.signals).toHaveLength(10_000)
    // Oldest (at = 0..4) should be dropped; remaining starts at at = 5
    expect((result.signals[0] as { at: number }).at).toBe(5)
  })
})

describe('Recorder onSignal subscription', () => {
  it('delivers buffered signals to subscribers while recording', () => {
    const r = createRecorder()
    const received: Signal[] = []
    r.onSignal((s) => received.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    r.__push(makeLongTask(2, 60))
    expect(received).toHaveLength(2)
  })

  it('unsubscribe stops delivery', () => {
    const r = createRecorder()
    const received: Signal[] = []
    const unsubscribe = r.onSignal((s) => received.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    unsubscribe()
    r.__push(makeLongTask(2, 60))
    expect(received).toHaveLength(1)
  })

  it('multiple subscribers all receive', () => {
    const r = createRecorder()
    const a: Signal[] = []
    const b: Signal[] = []
    r.onSignal((s) => a.push(s))
    r.onSignal((s) => b.push(s))
    r.start()
    r.__push(makeLongTask(1, 60))
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('subscriber error does not break other subscribers', () => {
    const r = createRecorder()
    const received: Signal[] = []
    r.onSignal(() => {
      throw new Error('boom')
    })
    r.onSignal((s) => received.push(s))
    r.start()
    expect(() => r.__push(makeLongTask(1, 60))).not.toThrow()
    expect(received).toHaveLength(1)
  })
})
