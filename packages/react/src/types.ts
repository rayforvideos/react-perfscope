import type { Collector } from '@react-perfscope/core'

/**
 * Resolves a DOM element back to the nearest React component name in the
 * fiber tree. Returns null when no React fiber is attached (e.g. host nodes
 * outside any React root, detached nodes, or before React mounts).
 */
export interface ReactAdapter {
  /**
   * Install the DevTools global hook to observe React commits. Idempotent:
   * a second install is a no-op (or chains with an existing hook installed
   * by React DevTools).
   */
  install(): void

  /**
   * Look up the component name for a DOM element by walking its fiber.
   */
  resolveComponentFromElement(el: HTMLElement): string | null
}

/**
 * Minimal shape of a React fiber node that we touch. The real fiber has
 * many more fields; we only declare what we read.
 */
export interface MinimalFiber {
  stateNode: unknown
  type: unknown
  return: MinimalFiber | null
  child: MinimalFiber | null
  sibling: MinimalFiber | null
  alternate: MinimalFiber | null
  elementType?: unknown
  memoizedProps?: unknown
  /** Set by React when the fiber is inside a Profiler-enabled root. */
  actualDuration?: number
}

/**
 * The DevTools global hook React looks for at module load time. We register
 * our own listener via `onCommitFiberRoot`.
 */
export interface ReactDevToolsHook {
  onCommitFiberRoot?: (
    rendererId: number,
    root: { current: MinimalFiber },
    priorityLevel?: unknown
  ) => void
  // React DevTools sets many more fields; we only need this one.
  [key: string]: unknown
}

/**
 * Re-export for convenience.
 */
export type { Collector }
