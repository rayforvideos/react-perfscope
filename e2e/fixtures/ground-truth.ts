// Native, browser-provided ground truth captured alongside react-perfscope's
// own collectors. The harness compares the two: perfscope reads these same
// Performance APIs, so the recorded values must line up with what the browser
// reports directly. PerformanceObserver delivers entries asynchronously (after
// the task / next frame), so callers must yield before reading.

const longTaskDurations: number[] = []
const layoutShiftValues: number[] = []
let ltObs: PerformanceObserver | undefined
let lsObs: PerformanceObserver | undefined

function supportsLoAF(): boolean {
  const types = (PerformanceObserver as { supportedEntryTypes?: readonly string[] })
    .supportedEntryTypes
  return Array.isArray(types) && types.includes('long-animation-frame')
}

export function startGroundTruth(): void {
  try {
    // Observe the SAME entry type the long-task collector uses (LoAF where
    // available, legacy longtask otherwise), so durations are comparable.
    const ltType = supportsLoAF() ? 'long-animation-frame' : 'longtask'
    ltObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTaskDurations.push(e.duration)
    })
    ltObs.observe({ type: ltType, buffered: true })
  } catch {
    /* longtask unsupported (non-Chromium) */
  }
  try {
    lsObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        layoutShiftValues.push((e as PerformanceEntry & { value: number }).value)
      }
    })
    lsObs.observe({ type: 'layout-shift', buffered: true })
  } catch {
    /* layout-shift unsupported */
  }
}

export function resetGroundTruth(): void {
  longTaskDurations.length = 0
  layoutShiftValues.length = 0
}

export function getGroundTruth(): { longTasks: number[]; layoutShifts: number[] } {
  return { longTasks: longTaskDurations.slice(), layoutShifts: layoutShiftValues.slice() }
}
