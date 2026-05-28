import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installDevToolsHook, uninstallDevToolsHook } from '../src/devtools-hook'
import type { ReactDevToolsHook } from '../src/types'

beforeEach(() => {
  // Clear both the global hook and any listeners left behind by earlier tests.
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

describe('installDevToolsHook', () => {
  it('creates the global hook when none exists', () => {
    installDevToolsHook(() => {})
    expect((globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__).toBeDefined()
  })

  it('routes commits to the registered listener', () => {
    const received: number[] = []
    installDevToolsHook((root) => {
      received.push((root.current as { stateNode: number }).stateNode as number)
    })
    const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 42 } as never }, undefined)
    expect(received).toEqual([42])
  })

  it('chains with an existing hook (preserves prior onCommitFiberRoot)', () => {
    const priorCommits: unknown[] = []
    ;(globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      onCommitFiberRoot(_rendererId, root) {
        priorCommits.push(root)
      },
    }
    const ourCommits: unknown[] = []
    installDevToolsHook((root) => {
      ourCommits.push(root)
    })
    const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    const fakeRoot = { current: { stateNode: 99 } as never }
    hook.onCommitFiberRoot!(1, fakeRoot, undefined)
    expect(priorCommits).toHaveLength(1)
    expect(ourCommits).toHaveLength(1)
  })

  it('uninstallDevToolsHook removes our listener while preserving prior', () => {
    const priorCommits: unknown[] = []
    ;(globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      onCommitFiberRoot(_rendererId, root) {
        priorCommits.push(root)
      },
    }
    const ourCommits: unknown[] = []
    const unsubscribe = installDevToolsHook((root) => {
      ourCommits.push(root)
    })
    unsubscribe()
    const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)
    expect(priorCommits).toHaveLength(1)
    expect(ourCommits).toHaveLength(0)
  })

  it('multiple installs all receive commits', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    installDevToolsHook((root) => a.push(root))
    installDevToolsHook((root) => b.push(root))
    const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('listener errors do not break other listeners', () => {
    const ok: unknown[] = []
    installDevToolsHook(() => {
      throw new Error('boom')
    })
    installDevToolsHook((root) => ok.push(root))
    const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    expect(() => hook.onCommitFiberRoot!(1, { current: { stateNode: 1 } as never }, undefined)).not.toThrow()
    expect(ok).toHaveLength(1)
  })
})
