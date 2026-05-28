import type { MinimalFiber } from './types'
import { fiberComponentName } from './fiber-walker'

const FIBER_KEY_PATTERNS = ['__reactFiber$', '__reactInternalInstance$']

function findFiberOnElement(el: HTMLElement): MinimalFiber | null {
  for (const key of Object.keys(el)) {
    for (const pattern of FIBER_KEY_PATTERNS) {
      if (key.startsWith(pattern)) {
        return (el as HTMLElement & Record<string, MinimalFiber>)[key] ?? null
      }
    }
  }
  return null
}

/**
 * Walk up from the fiber attached to `el` until we find one whose `type` is
 * a function or class component (not a host tag string). Returns that
 * component's display name. If no component is found, returns the host
 * tag name of the starting fiber. If no fiber is attached, returns null.
 */
export function resolveComponentFromElement(el: HTMLElement): string | null {
  const start = findFiberOnElement(el)
  if (!start) return null
  let node: MinimalFiber | null = start
  while (node) {
    if (typeof node.type === 'function' || (node.type && typeof node.type === 'object')) {
      const name = fiberComponentName(node)
      if (name) return name
    }
    node = node.return
  }
  // Nothing but host fibers above — return the host tag name of the starting fiber.
  return fiberComponentName(start)
}
