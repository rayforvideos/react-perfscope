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
})
