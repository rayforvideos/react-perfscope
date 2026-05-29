import type { Collector, Signal } from '../types'

interface LayoutShiftSource {
  currentRect: DOMRect
  previousRect?: DOMRect
  node?: Node | null
}

interface LayoutShiftEntryLike extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
  sources?: LayoutShiftSource[]
}

const PERFSCOPE_HOST_ATTR = 'data-perfscope-host'

function rectsOverlap(a: DOMRect, b: DOMRect, tolerance = 0): boolean {
  return !(
    a.x + a.width < b.x - tolerance ||
    b.x + b.width < a.x - tolerance ||
    a.y + a.height < b.y - tolerance ||
    b.y + b.height < a.y - tolerance
  )
}

/**
 * Returns true when every source in the entry is part of our floating
 * widget. We want to ignore shifts caused by the perfscope UI itself.
 *
 * Detection has two paths:
 *   1. Node-based: walk up `source.node` looking for `[data-perfscope-host]`.
 *      Works when the node is in light DOM.
 *   2. Rect-based fallback: compare `source.currentRect` against every host
 *      element's bounding rect. This catches the Shadow-DOM case where the
 *      browser doesn't expose the inner node (Shadow root boundary).
 */
function collectPerfscopeRects(): DOMRect[] {
  const hosts = Array.from(document.querySelectorAll(`[${PERFSCOPE_HOST_ATTR}]`))
  const rects: DOMRect[] = []
  for (const h of hosts) {
    // The light-DOM host element usually has height 0 because Shadow DOM
    // content isn't part of its layout. We need to peek inside the shadow
    // root and collect bounds of any positioned children.
    const sr = (h as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (sr) {
      for (const child of Array.from(sr.children)) {
        const r = (child as Element).getBoundingClientRect()
        if (r.width > 0 && r.height > 0) rects.push(r)
      }
    } else {
      const r = h.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) rects.push(r)
    }
  }
  return rects
}

function entryIsOnlyFromPerfscope(sources: LayoutShiftSource[]): boolean {
  if (sources.length === 0) return false
  if (typeof document === 'undefined') return false

  const hostRects = collectPerfscopeRects()
  if (hostRects.length === 0) return false

  for (const src of sources) {
    let matched = false
    const node = src.node as (Node & { closest?: (sel: string) => Element | null }) | null | undefined
    if (node) {
      // Node-based check
      if (typeof (node as { closest?: unknown }).closest === 'function') {
        if ((node as Element).closest(`[${PERFSCOPE_HOST_ATTR}]`)) matched = true
      } else {
        let parent: (Element | null) = (node as Node).parentElement as Element | null
        while (parent) {
          if (parent.hasAttribute(PERFSCOPE_HOST_ATTR)) { matched = true; break }
          parent = parent.parentElement
        }
      }
    }
    // Rect-based fallback (shadow DOM): if source rect overlaps any of our
    // host rects, consider it our widget. Tolerance covers the case where
    // the widget changes size during the shift (its previous/current bounds
    // differ but both sit in the same screen corner).
    if (!matched) {
      for (const hostRect of hostRects) {
        if (rectsOverlap(src.currentRect, hostRect, 24)) {
          matched = true
          break
        }
      }
    }
    if (!matched) return false
  }
  return true
}

export function createLayoutShiftCollector(): Collector {
  let observer: PerformanceObserver | null = null
  let active = false

  return {
    kind: 'layout-shift',
    activate(emit: (signal: Signal) => void) {
      if (typeof PerformanceObserver === 'undefined') {
        console.warn('[react-perfscope] PerformanceObserver not supported; layout-shift disabled')
        return
      }
      active = true
      try {
        observer = new PerformanceObserver((list) => {
          if (!active) return
          for (const raw of list.getEntries()) {
            const entry = raw as LayoutShiftEntryLike
            // Note: production CLS metrics exclude shifts with hadRecentInput
            // (user-initiated movements are considered intentional). For a
            // dev tool, the user explicitly WANTS to see what their clicks
            // caused — so we report these too.
            const sources = entry.sources ?? []
            if (entryIsOnlyFromPerfscope(sources)) continue
            const rects = sources.map((s) => s.currentRect)
            emit({
              kind: 'layout-shift',
              at: entry.startTime,
              value: entry.value,
              sources: rects,
            })
          }
        })
        observer.observe({ type: 'layout-shift', buffered: false })
      } catch (err) {
        console.warn('[react-perfscope] layout-shift collector failed to start:', err)
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
  }
}
