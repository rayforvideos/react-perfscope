import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRecorder } from '@react-perfscope/core'
import type { Signal, RenderSignal } from '@react-perfscope/core'
import { createRenderCollector } from '../src/render-collector'
import { uninstallDevToolsHook } from '../src/devtools-hook'
import type { MinimalFiber, ReactDevToolsHook } from '../src/types'
import { PERFORMED_WORK } from '../src/render-reason'

beforeEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

afterEach(() => {
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
})

function fireCommit(root: MinimalFiber) {
  const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  hook?.onCommitFiberRoot?.(1, { current: root })
}

function makeFiber(type: unknown, opts: Partial<MinimalFiber> = {}): MinimalFiber {
  return {
    stateNode: null,
    type,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    flags: PERFORMED_WORK,
    ...opts,
  } as MinimalFiber
}

describe('Recorder + render collector integration', () => {
  it('captures render signals during a recording session', () => {
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    recorder.start()

    function App() { return null }
    function Header() { return null }
    const appFiber = makeFiber(App)
    const headerFiber = makeFiber(Header, { return: appFiber })
    appFiber.child = headerFiber
    fireCommit(appFiber)

    const result = recorder.stop()
    const renders = result.signals.filter((s: Signal) => s.kind === 'render') as RenderSignal[]
    const names = renders.map((s) => s.component)
    expect(names).toContain('App')
    expect(names).toContain('Header')
  })

  it('does not capture renders fired before start or after stop', () => {
    const recorder = createRecorder()
    recorder.use(createRenderCollector())
    function Foo() { return null }

    // Before start
    fireCommit(makeFiber(Foo))

    recorder.start()
    fireCommit(makeFiber(Foo))
    recorder.stop()

    // After stop
    fireCommit(makeFiber(Foo))

    recorder.start()
    const result = recorder.stop()
    expect(result.signals.filter((s) => s.kind === 'render')).toHaveLength(0)
  })
})
