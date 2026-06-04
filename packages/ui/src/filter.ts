import type { Signal } from '@react-perfscope/core'

/**
 * Lowercased, human-readable text for a signal, used for substring filtering
 * in the panel. Covers the fields a developer would actually search by:
 * component names, request URLs, metric names, source functions/files.
 */
export function signalSearchText(signal: Signal): string {
  switch (signal.kind) {
    case 'render': {
      const parts = [signal.component]
      if (signal.changedProps) parts.push(...signal.changedProps)
      if (signal.members) for (const m of signal.members) parts.push(m.component)
      return parts.join(' ').toLowerCase()
    }
    case 'network':
      return signal.url.toLowerCase()
    case 'web-vital':
      return signal.name.toLowerCase()
    case 'interaction':
      return [signal.eventType, signal.target ?? ''].join(' ').toLowerCase()
    case 'forced-reflow': {
      const f = signal.stack[0]
      return f ? [f.fnName ?? '', f.file].join(' ').toLowerCase() : ''
    }
    case 'long-task': {
      const parts: string[] = []
      if (signal.scripts)
        for (const s of signal.scripts) parts.push(s.sourceFunctionName, s.invoker, s.sourceURL)
      if (signal.attribution)
        for (const a of signal.attribution) parts.push(a.frame.fnName ?? '', a.frame.file)
      return parts.join(' ').toLowerCase()
    }
    case 'layout-shift':
      return 'layout-shift'
    default:
      return ''
  }
}

/** Whether a signal matches a free-text filter query. Empty query matches all. */
export function signalMatchesFilter(signal: Signal, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return signalSearchText(signal).includes(q)
}
