import type { SignalKind } from './types'

export type Capabilities = Record<SignalKind, boolean>

function supportedEntryTypes(): readonly string[] | undefined {
  const PO = (globalThis as { PerformanceObserver?: { supportedEntryTypes?: readonly string[] } })
    .PerformanceObserver
  return PO?.supportedEntryTypes
}

/** True unless the browser exposes `supportedEntryTypes` AND it includes none of
 * the needed entry types. An unknown environment (older browsers / test envs
 * that don't expose the list) is treated as supported, so we never falsely
 * report a feature missing — the collector's own try/catch is the backstop. */
function observerSupported(needed: readonly string[]): boolean {
  const types = supportedEntryTypes()
  if (!Array.isArray(types)) return true
  return needed.some((t) => types.includes(t))
}

/** Which signal kinds the current browser can actually measure. The render and
 * forced-reflow collectors are pure JS (React fibers / DOM-API instrumentation)
 * so they work everywhere; the rest depend on PerformanceObserver entry types
 * that Firefox and Safari do not implement (long tasks, layout shift, INP). */
export function detectCapabilities(): Capabilities {
  return {
    'forced-reflow': true,
    render: true,
    'web-vital': true,
    'layout-shift': observerSupported(['layout-shift']),
    'long-task': observerSupported(['long-animation-frame', 'longtask']),
    interaction: observerSupported(['event']),
    network: observerSupported(['resource']),
  }
}

/** Signal kinds the current browser cannot measure — for telling the user a
 * tab is empty because of the platform, not because nothing happened. */
export function unsupportedKinds(): SignalKind[] {
  const caps = detectCapabilities()
  return (Object.keys(caps) as SignalKind[]).filter((k) => !caps[k])
}
