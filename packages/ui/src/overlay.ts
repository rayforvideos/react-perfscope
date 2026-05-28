const OVERLAY_MARKER = 'data-perfscope-overlay'

function getOrCreate(id: string): HTMLElement {
  const existing = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
  if (existing) return existing as HTMLElement
  const el = document.createElement('div')
  el.setAttribute(OVERLAY_MARKER, id)
  el.style.position = 'fixed'
  el.style.pointerEvents = 'none'
  el.style.boxSizing = 'border-box'
  el.style.border = '2px solid #ff3b30'
  el.style.background = 'rgba(255, 59, 48, 0.12)'
  el.style.zIndex = '2147483646'
  el.style.borderRadius = '2px'
  el.style.transition = 'opacity 80ms ease-out'
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

export function hideOverlay(id: string): void {
  const el = document.querySelector(`[${OVERLAY_MARKER}="${id}"]`)
  if (el) el.remove()
}

export function hideAllOverlays(): void {
  for (const el of Array.from(document.querySelectorAll(`[${OVERLAY_MARKER}]`))) {
    el.remove()
  }
}
