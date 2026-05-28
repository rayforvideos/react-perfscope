import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/preact'
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
})
