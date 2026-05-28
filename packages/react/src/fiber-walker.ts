import type { MinimalFiber } from './types'

const MEMO_TYPE = Symbol.for('react.memo')
const FORWARD_REF_TYPE = Symbol.for('react.forward_ref')

type WrapperType = {
  $$typeof: symbol
  type?: unknown
  render?: unknown
}

function namedFunctionName(value: unknown): string | null {
  if (typeof value !== 'function') return null
  const fn = value as { displayName?: string; name?: string }
  if (typeof fn.displayName === 'string' && fn.displayName.length > 0) return fn.displayName
  if (typeof fn.name === 'string' && fn.name.length > 0) return fn.name
  return null
}

/**
 * Return the component name for a fiber.
 *
 * Host components (DOM tags) return their tag string. Function and class
 * components return their displayName or name. Memo and forwardRef wrappers
 * are unwrapped to their inner component. Unknown shapes return null.
 */
export function fiberComponentName(fiber: MinimalFiber | null): string | null {
  if (!fiber) return null
  const type = fiber.type
  if (typeof type === 'string') return type
  if (typeof type === 'function') return namedFunctionName(type)
  if (type && typeof type === 'object') {
    const wrapper = type as WrapperType
    if (wrapper.$$typeof === MEMO_TYPE) {
      return namedFunctionName(wrapper.type)
    }
    if (wrapper.$$typeof === FORWARD_REF_TYPE) {
      return namedFunctionName(wrapper.render)
    }
  }
  return null
}

interface WalkOptions {
  /**
   * Maximum number of fibers to visit. Prevents runaway traversal on very
   * deep trees. Default 10_000.
   */
  stopAt?: number
}

/**
 * Walk a fiber subtree depth-first, invoking `visit` for every fiber.
 * Returns early once `stopAt` fibers have been visited.
 */
export function walkChangedFibers(
  root: MinimalFiber,
  visit: (fiber: MinimalFiber) => void,
  opts: WalkOptions = {}
): void {
  const max = opts.stopAt ?? 10_000
  let count = 0
  let node: MinimalFiber | null = root
  while (node) {
    visit(node)
    count++
    if (count >= max) return
    if (node.child) {
      node = node.child
      continue
    }
    while (node && !node.sibling) {
      if (node === root) return
      node = node.return
    }
    if (!node || node === root) return
    node = node.sibling
  }
}
