import type { Signal, HeapSample, Episode } from '@react-perfscope/core'
import type { Scenarios } from './fixtures/scenarios'

export interface FinalizedResult {
  signals: Signal[]
  duration: number
  heapSamples?: HeapSample[]
  frames?: number[]
  episodes: Episode[]
}

export interface PerfscopeTestApi {
  start(): void
  stop(): Promise<FinalizedResult>
  /** BUFFER_CAP from the recorder, exposed so the safety spec can assert the
   * buffer never exceeds it. */
  readonly bufferCap: number
  /** Wait one animation frame then `ms` more (default 100), so async
   * PerformanceObserver entries are delivered before stop(). */
  settle(ms?: number): Promise<void>
  groundTruth: {
    get(): { longTasks: number[]; layoutShifts: number[] }
    commitDurations(): number[]
    reset(): void
  }
  scenarios: Scenarios
}

declare global {
  interface Window {
    __perfscopeTest?: PerfscopeTestApi
    __perfscopeReady?: boolean
  }
}
