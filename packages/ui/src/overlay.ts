const OVERLAY_MARKER = 'data-perfscope-overlay'
const FADE_MS = 80

function getOrCreate(id: string): HTMLElement {
  const existing = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
  if (existing) return existing as HTMLElement
  const el = document.createElement('div')
  el.setAttribute(OVERLAY_MARKER, id)
  // position:absolute (not fixed) so the highlight tracks the shifted
  // DOM position when the user scrolls. Coordinates passed to showOverlay
  // are document-relative (already adjusted by the layout-shift collector).
  el.style.position = 'absolute'
  el.style.pointerEvents = 'none'
  el.style.boxSizing = 'border-box'
  el.style.border = '2px solid #ff3b30'
  el.style.background = 'rgba(255, 59, 48, 0.12)'
  el.style.zIndex = '2147483646'
  el.style.borderRadius = '2px'
  el.style.transition = `opacity ${FADE_MS}ms ease-out`
  document.body.appendChild(el)
  return el
}

export function showOverlay(id: string, rect: DOMRect): void {
  const el = getOrCreate(id)
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.style.opacity = '1'
}

/**
 * Trigger the fade-out transition and remove the overlay after it completes.
 * If the overlay is shown again before the fade timer fires, the timer is
 * cancelled and the element is kept.
 */
export function hideOverlay(id: string): void {
  const el = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`) as HTMLElement | null
  if (!el) return
  el.style.opacity = '0'
  setTimeout(() => {
    // Re-check existence in case the caller re-showed the overlay during the fade
    const stillThere = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
    if (stillThere && (stillThere as HTMLElement).style.opacity === '0') {
      stillThere.remove()
    }
  }, FADE_MS + 20)
}

/**
 * Remove every overlay immediately, skipping the fade. Used by Panel
 * unmount cleanup where we don't want lingering overlays.
 */
export function hideAllOverlays(): void {
  for (const el of Array.from(document.querySelectorAll(`[${OVERLAY_MARKER}]`))) {
    el.remove()
  }
}
