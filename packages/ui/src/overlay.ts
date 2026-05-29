const OVERLAY_MARKER = 'data-perfscope-overlay'
const ARROW_MARKER = 'data-perfscope-overlay-arrow'
const FADE_MS = 80

const DEFAULT_BORDER = '#ff3b30'
const DEFAULT_FILL = 'rgba(255, 59, 48, 0.12)'

export interface OverlayStyle {
  /** Border color (CSS color). Defaults to red. */
  border?: string
  /** Background fill (CSS color). Defaults to translucent red. */
  fill?: string
  /** Optional dashed border for "previous position" overlays. */
  dashed?: boolean
}

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
  el.style.border = `2px solid ${DEFAULT_BORDER}`
  el.style.background = DEFAULT_FILL
  el.style.zIndex = '2147483646'
  el.style.borderRadius = '2px'
  el.style.transition = `opacity ${FADE_MS}ms ease-out`
  document.body.appendChild(el)
  return el
}

export function showOverlay(id: string, rect: DOMRect, style?: OverlayStyle): void {
  const el = getOrCreate(id)
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.style.opacity = '1'
  const border = style?.border ?? DEFAULT_BORDER
  const fill = style?.fill ?? DEFAULT_FILL
  el.style.borderStyle = style?.dashed ? 'dashed' : 'solid'
  el.style.borderColor = border
  el.style.background = fill
}

/**
 * Draws a translucent SVG arrow between two document-coord points.
 * Useful for visualising a layout-shift's previous → current position.
 * The arrow is appended to document.body as a single absolutely-positioned
 * SVG that spans the bounding box of the two points.
 */
export function showArrow(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string = DEFAULT_BORDER,
): void {
  // Reuse / replace existing arrow for this id
  let svg = document.querySelector(`[${ARROW_MARKER}="${id}"]`) as SVGSVGElement | null
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
    svg.setAttribute(ARROW_MARKER, id)
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    svg.style.overflow = 'visible'
    svg.style.zIndex = '2147483646'
    svg.style.transition = `opacity ${FADE_MS}ms ease-out`
    document.body.appendChild(svg)
  }
  // Position the SVG at the bounding box, draw the arrow in local coords
  const minX = Math.min(from.x, to.x)
  const minY = Math.min(from.y, to.y)
  const w = Math.max(2, Math.abs(to.x - from.x))
  const h = Math.max(2, Math.abs(to.y - from.y))
  svg.style.left = `${minX}px`
  svg.style.top = `${minY}px`
  svg.setAttribute('width', `${w}`)
  svg.setAttribute('height', `${h}`)
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.style.opacity = '1'

  while (svg.firstChild) svg.removeChild(svg.firstChild)

  const fx = from.x - minX
  const fy = from.y - minY
  const tx = to.x - minX
  const ty = to.y - minY

  const markerId = `perfscope-arrowhead-${id}`
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
  marker.setAttribute('id', markerId)
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '8')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerWidth', '6')
  marker.setAttribute('markerHeight', '6')
  marker.setAttribute('orient', 'auto-start-reverse')
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
  arrowPath.setAttribute('fill', color)
  marker.appendChild(arrowPath)
  defs.appendChild(marker)
  svg.appendChild(defs)

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line.setAttribute('x1', `${fx}`)
  line.setAttribute('y1', `${fy}`)
  line.setAttribute('x2', `${tx}`)
  line.setAttribute('y2', `${ty}`)
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', '3')
  line.setAttribute('stroke-linecap', 'round')
  line.setAttribute('marker-end', `url(#${markerId})`)
  svg.appendChild(line)
}

export function hideArrow(id: string): void {
  const svg = document.querySelector(`[${ARROW_MARKER}="${id}"]`)
  if (svg) svg.remove()
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
  for (const el of Array.from(document.querySelectorAll(`[${ARROW_MARKER}]`))) {
    el.remove()
  }
}
