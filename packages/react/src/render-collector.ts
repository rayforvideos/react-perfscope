import type { Collector, RenderSignal, Signal } from '@react-perfscope/core'
import { installDevToolsHook } from './devtools-hook'
import { fiberComponentName, walkChangedFibers } from './fiber-walker'
import { classifyRenderReason, didPerformWork, subtreeMightHaveRendered } from './render-reason'
import type { MinimalFiber } from './types'

/** The cascade root of a commit: the component whose own state/mount started
 * it. Falls back to the shallowest member. */
function cascadeRoot(members: RenderSignal[]): RenderSignal {
  let shallowest = members[0]!
  for (const m of members) {
    if (m.reason === 'state') return m
    if (m.depth < shallowest.depth) shallowest = m
  }
  return members.find((m) => m.reason === 'mount') ?? shallowest
}

export function createRenderCollector(): Collector {
  let active = false
  let emit: (signal: Signal) => void = () => {}
  let unsubscribe: (() => void) | null = null
  let commitId = 0

  function onCommit(root: { current: MinimalFiber }) {
    if (!active) return
    const at = performance.now()
    const id = commitId++
    const members: RenderSignal[] = []
    walkChangedFibers(
      root.current,
      (fiber, depth) => {
        // Skip host (DOM) fibers — we only want function/class components in
        // render reports.
        if (typeof fiber.type === 'string') return
        // Only report fibers that actually re-ran their render this commit.
        // A bailed-out fiber (e.g. memo with equal props) keeps its place in
        // the tree but did no work, so reporting it would be noise.
        if (!didPerformWork(fiber)) return
        const name = fiberComponentName(fiber)
        if (!name) return
        const duration = typeof fiber.actualDuration === 'number' ? fiber.actualDuration : 0
        const { reason, changedProps } = classifyRenderReason(fiber)
        members.push({
          kind: 'render',
          at,
          component: name,
          reason,
          duration,
          commitId: id,
          depth,
          ...(changedProps ? { changedProps } : {}),
        })
      },
      // Prune subtrees that did no work this commit. Without this, a leaf that
      // mounted long ago keeps its stale PerformedWork flag and gets reported
      // as a phantom render on every unrelated commit.
      { descend: subtreeMightHaveRendered }
    )
    if (members.length === 0) return
    // One coalesced signal per commit. The root describes the cascade; the
    // duration is the commit's total render time.
    const root2 = cascadeRoot(members)
    let total = 0
    for (const m of members) total += m.duration
    emit({
      kind: 'render',
      at,
      component: root2.component,
      reason: root2.reason,
      duration: total,
      commitId: id,
      depth: root2.depth,
      ...(root2.changedProps ? { changedProps: root2.changedProps } : {}),
      members,
      count: members.length,
    })
  }

  return {
    kind: 'render',
    activate(emitFn) {
      emit = emitFn
      active = true
      if (unsubscribe) return
      unsubscribe = installDevToolsHook(onCommit)
    },
    deactivate() {
      active = false
      // Keep the global hook listener attached — installDevToolsHook is
      // idempotent and removing it on every deactivate would cost us the
      // ability to re-attach cleanly under the test reset hooks. The
      // `active` flag gates emission.
    },
  }
}
