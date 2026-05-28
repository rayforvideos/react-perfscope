import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/preact'
import type { RecordingResult, Signal } from '@react-perfscope/core'
import { Panel } from '../src/panel'

function makeResult(signals: Signal[]): RecordingResult {
  return { signals, startedAt: 0, duration: 1000 }
}

describe('Panel', () => {
  it('renders a tab for each signal kind present in the result', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'long-task', at: 1, duration: 100, stack: [] },
      { kind: 'render', at: 2, component: 'Foo', reason: 'commit', duration: 0 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.getByText(/forced-reflow/i)).toBeTruthy()
    expect(screen.getByText(/long-task/i)).toBeTruthy()
    expect(screen.getByText(/render/i)).toBeTruthy()
    cleanup()
  })

  it('shows the count next to each tab label', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'forced-reflow', at: 1, duration: 2, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toMatch(/forced-reflow.*2/i)
    cleanup()
  })

  it('switches the visible signal list when a tab is clicked', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 0, duration: 1, stack: [] },
      { kind: 'render', at: 5, component: 'Foo', reason: 'commit', duration: 0 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    // Default tab shows first kind (forced-reflow). Click 'render' tab.
    fireEvent.click(screen.getByText(/render/i))
    expect(container.textContent).toContain('Foo')
    cleanup()
  })

  it('shows empty state when no signals were recorded', () => {
    const result = makeResult([])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.getByText(/no signals/i)).toBeTruthy()
    cleanup()
  })

  it('formats render signal with component name', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'Header', reason: 'commit', duration: 4.2 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toContain('Header')
    expect(container.textContent).toMatch(/4\.2/)
    cleanup()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const result = makeResult([])
    render(<Panel result={result} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalledOnce()
    cleanup()
  })
})
