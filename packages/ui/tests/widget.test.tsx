import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { Widget } from '../src/widget'

describe('Widget', () => {
  it('renders the idle state by default', () => {
    const { container } = render(<Widget recording={false} onToggle={() => {}} />)
    expect(container.textContent).toContain('rec')
    cleanup()
  })

  it('renders the recording state with elapsed time', () => {
    const { container } = render(<Widget recording={true} elapsedMs={4321} onToggle={() => {}} />)
    expect(container.textContent).toMatch(/0:04/)
    cleanup()
  })

  it('calls onToggle when the button is clicked', () => {
    const onToggle = vi.fn()
    const { container } = render(<Widget recording={false} onToggle={onToggle} />)
    const btn = container.querySelector('button')!
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledOnce()
    cleanup()
  })

  it('applies the position attribute', () => {
    const { container } = render(
      <Widget recording={false} onToggle={() => {}} position="top-left" />
    )
    const root = container.querySelector('[data-position]')
    expect(root?.getAttribute('data-position')).toBe('top-left')
    cleanup()
  })

  it('sets aria-pressed=true when recording, false when idle', () => {
    const idle = render(<Widget recording={false} onToggle={() => {}} />)
    expect(idle.container.querySelector('button')?.getAttribute('aria-pressed')).toBe('false')
    cleanup()

    const rec = render(<Widget recording={true} elapsedMs={0} onToggle={() => {}} />)
    expect(rec.container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true')
    cleanup()
  })

  it('has an aria-live polite region for the elapsed counter', () => {
    const { container } = render(<Widget recording={true} elapsedMs={2000} onToggle={() => {}} />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toBeTruthy()
    expect(live?.textContent).toMatch(/0:02/)
    cleanup()
  })

  it('has an explicit aria-label on the toggle button', () => {
    const idleNode = render(<Widget recording={false} onToggle={() => {}} />)
    const idleBtn = idleNode.container.querySelector('button')
    expect(idleBtn?.getAttribute('aria-label')).toMatch(/start recording/i)
    cleanup()
    const recNode = render(<Widget recording={true} elapsedMs={0} onToggle={() => {}} />)
    const recBtn = recNode.container.querySelector('button')
    expect(recBtn?.getAttribute('aria-label')).toMatch(/stop recording/i)
    cleanup()
  })
})
