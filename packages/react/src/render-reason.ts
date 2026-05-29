import type { MinimalFiber } from './types'

/** React's `PerformedWork` flag — set on a fiber whose render actually ran. */
export const PERFORMED_WORK = 0b1

export type RenderReason = 'mount' | 'state' | 'props' | 'parent'

export interface RenderReasonResult {
  reason: RenderReason
  changedProps?: string[]
}

export function didPerformWork(fiber: MinimalFiber | null): boolean {
  if (!fiber || typeof fiber.flags !== 'number') return false
  return (fiber.flags & PERFORMED_WORK) !== 0
}

/**
 * Should the walk descend into this fiber's children when hunting for renders?
 *
 * React bubbles the `PerformedWork` bit of every descendant into a fiber's
 * `subtreeFlags`, and (unlike `flags`) resets it whenever the reconciler
 * re-clones the fiber. So a numeric `subtreeFlags` without the bit reliably
 * means "no descendant rendered this commit" — we can stop here and avoid
 * stale leaves whose own `flags` never got cleared.
 *
 * When `subtreeFlags` is absent (React < 18) we cannot prune safely, so we
 * descend and fall back to the full-tree walk.
 */
export function subtreeMightHaveRendered(fiber: MinimalFiber): boolean {
  if (typeof fiber.subtreeFlags !== 'number') return true
  return (fiber.subtreeFlags & PERFORMED_WORK) !== 0
}

/**
 * Walk up `.return` to the nearest *component* fiber, skipping host (DOM)
 * fibers. A component's immediate `.return` is usually a host fiber (the
 * `<div>` it's nested in), not its parent component — so to ask "did my
 * parent component render?" we have to climb past the host nodes first.
 */
export function nearestComponentAncestor(fiber: MinimalFiber): MinimalFiber | null {
  let p = fiber.return
  while (p) {
    if (typeof p.type === 'function') return p
    p = p.return
  }
  return null
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** Shallow diff of two prop bags. Returns the keys whose values differ. */
export function changedPropKeys(prev: unknown, next: unknown): string[] {
  if (prev === next) return []
  const p = asObject(prev)
  const n = asObject(next)
  const keys = new Set([...Object.keys(p), ...Object.keys(n)])
  const changed: string[] = []
  for (const k of keys) {
    if (p[k] !== n[k]) changed.push(k)
  }
  return changed
}

/**
 * Classify WHY a fiber that performed work this commit rendered.
 *
 * - `mount`  — first render (no previous fiber).
 * - `props`  — at least one prop changed since the previous render.
 * - `state`  — props are identical AND the parent did not render, so the
 *              update originated here (own state/force update). This is the
 *              root of a render cascade.
 * - `parent` — props are identical but the parent rendered, so this only
 *              re-rendered because of its parent. This is the avoidable
 *              "wrap me in memo" case the developer is hunting for.
 *
 * Assumes the caller only invokes this for fibers that actually performed
 * work (see `didPerformWork`).
 */
export function classifyRenderReason(fiber: MinimalFiber): RenderReasonResult {
  if (!fiber.alternate) return { reason: 'mount' }
  const changed = changedPropKeys(fiber.alternate.memoizedProps, fiber.memoizedProps)
  if (changed.length > 0) return { reason: 'props', changedProps: changed }
  if (didPerformWork(nearestComponentAncestor(fiber))) return { reason: 'parent' }
  return { reason: 'state' }
}
