/**
 * End-to-end smoke test: real React 18 tree → render collector → UI panel.
 *
 * React's injectInternals() is called at react-dom's module-level initialisation
 * (when the module is first evaluated), so `__REACT_DEVTOOLS_GLOBAL_HOOK__` must
 * exist on `globalThis` before react-dom is imported. We achieve this via
 * `vi.hoisted`, which vitest hoists to the very top of the module before any
 * import statements are executed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

// Install a minimal React-compatible DevTools hook BEFORE react-dom loads.
// vi.hoisted() runs before all import statements in this module.
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>
  if (!g.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let nextRendererId = 1
    g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => nextRendererId++,
      onCommitFiberRoot: undefined as unknown,
    }
  }
})

import { act as preactAct } from 'preact/test-utils'
import { act as reactAct, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createRecorder } from '@react-perfscope/core'
import { createRenderCollector, uninstallDevToolsHook, installDevToolsHook } from '@react-perfscope/react'
import { mount as mountPerfscope } from '../src/mount'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.shift()!()
  uninstallDevToolsHook()
  delete (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  document.body.innerHTML = ''
})

describe('end-to-end', () => {
  it('captures render signals from a real React tree and shows them in the panel', async () => {
    // Set up the recorder + render collector.
    // The DevTools hook was already installed (via vi.hoisted above) before
    // react-dom loaded, so React stored our hook reference in its internal
    // injectedHook. installDevToolsHook now patches onCommitFiberRoot on the
    // same object, so all future commits will route to our listener.
    const recorder = createRecorder()
    recorder.use(createRenderCollector())

    // Mount the perfscope UI (Preact inside Shadow DOM)
    const unmountUI = mountPerfscope({ recorder })
    cleanups.push(unmountUI)

    // Mount a real React app — use createElement directly to avoid JSX transform
    // conflicts (the tsconfig uses preact as jsxImportSource for this package,
    // so <JSX /> in this file would produce Preact VNodes that React can't render).
    function Counter() {
      const [n, setN] = useState(0)
      return createElement(
        'button',
        { type: 'button', onClick: () => setN(n + 1), 'data-testid': 'counter' },
        `count: ${n}`
      )
    }

    const appHost = document.createElement('div')
    document.body.appendChild(appHost)
    const root = createRoot(appHost)
    reactAct(() => {
      root.render(createElement(Counter, null))
    })
    cleanups.push(() => {
      reactAct(() => root.unmount())
      appHost.remove()
    })

    // Click the perfscope widget to start recording.
    // Wrap in preactAct to flush Preact's async state updates.
    const perfscopeHost = document.querySelector('[data-perfscope-host]') as HTMLElement
    const widgetBtn = perfscopeHost.shadowRoot!.querySelector('button') as HTMLButtonElement
    await preactAct(() => {
      widgetBtn.click()
    })

    // Trigger a render in the real React tree
    const counterBtn = document.querySelector('[data-testid="counter"]') as HTMLButtonElement
    reactAct(() => {
      counterBtn.click()
    })

    // Stop recording (click widget again)
    const widgetBtnAfter = perfscopeHost.shadowRoot!.querySelector('button') as HTMLButtonElement
    await preactAct(() => {
      widgetBtnAfter.click()
    })

    // Panel should now be open and contain at least one render signal
    const panel = perfscopeHost.shadowRoot!.querySelector('[role="region"]')
    expect(panel).toBeTruthy()
    expect(panel!.textContent).toContain('Counter')
  })
})
