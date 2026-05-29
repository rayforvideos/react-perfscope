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
  /**
   * Predicate deciding whether to descend into a fiber's children. Returning
   * false prunes the entire subtree (the fiber itself is still visited). Used
   * to skip subtrees that did no work this commit. Defaults to always descend.
   */
  descend?: (fiber: MinimalFiber) => boolean
}

/**
 * Walk a fiber subtree depth-first, invoking `visit` for every fiber with its
 * depth relative to `root` (root is depth 0). Returns early once `stopAt`
 * fibers have been visited. When `descend` returns false for a fiber, its
 * children are skipped entirely.
 */
export function walkChangedFibers(
  root: MinimalFiber,
  visit: (fiber: MinimalFiber, depth: number) => void,
  opts: WalkOptions = {}
): void {
  const max = opts.stopAt ?? 10_000
  const descend = opts.descend ?? (() => true)
  let count = 0
  let depth = 0
  let node: MinimalFiber | null = root
  while (node) {
    visit(node, depth)
    count++
    if (count >= max) return
    if (node.child && descend(node)) {
      node = node.child
      depth++
      continue
    }
    while (node && !node.sibling) {
      if (node === root) return
      node = node.return
      depth--
    }
    if (!node || node === root) return
    node = node.sibling
  }
}
