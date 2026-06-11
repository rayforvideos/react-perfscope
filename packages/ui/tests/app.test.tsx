import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup, screen, act } from '@testing-library/preact'
import { options } from 'preact'
import { createRecorder } from '@react-perfscope/core'
import { App } from '../src/app'

describe('App', () => {
  it('starts in idle state with the widget visible and no panel', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    expect(container.querySelector('button')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /panel/i })).toBeNull()
    cleanup()
  })

  it('starts recording when the widget button is clicked', () => {
    const recorder = createRecorder()
    const startSpy = vi.spyOn(recorder, 'start')
    const { container } = render(<App recorder={recorder} />)
    fireEvent.click(container.querySelector('button')!)
    expect(startSpy).toHaveBeenCalledOnce()
    cleanup()
  })

  it('stops recording on second click and shows the panel', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(container.querySelectorAll('button')[0]!)
    expect(screen.queryByRole('region', { name: /panel/i })).toBeTruthy()
    cleanup()
  })

  it('closes the panel via the close button', () => {
    const recorder = createRecorder()
    const { container } = render(<App recorder={recorder} />)
    // Start and stop
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(container.querySelectorAll('button')[0]!)
    // Click the close button (matched by aria-label)
    const closeBtn = screen.getByLabelText(/close/i)
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: /panel/i })).toBeNull()
    cleanup()
  })

  it('does not re-render the widget on every animation frame while recording', () => {
    // The elapsed label only changes once per second — re-rendering at 60fps
    // during the measured window is self-perturbation for a perf tool.
    let rafCb: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let now = 0
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      const recorder = createRecorder()
      const { container } = render(<App recorder={recorder} />)
      fireEvent.click(container.querySelector('button')!) // start at now=0

      let appDiffs = 0
      const prevDiffed = options.diffed
      options.diffed = (vnode) => {
        if (vnode.type === App) appDiffs++
        prevDiffed?.(vnode)
      }
      try {
        // 30 frames, all inside the same displayed second (0:00)
        for (let frame = 0; frame < 30; frame++) {
          now += 16
          act(() => rafCb!(now))
        }
        expect(appDiffs).toBeLessThanOrEqual(1)

        // Crossing the second boundary must still update the label
        now = 1500
        act(() => rafCb!(now))
        expect(container.textContent).toContain('0:01')
      } finally {
        options.diffed = prevDiffed
      }
      cleanup()
    } finally {
      nowSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
