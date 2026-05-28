import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/preact'
import type { RecordingResult, Signal } from '@react-perfscope/core'
import { Panel } from '../src/panel'
import { hideAllOverlays } from '../src/overlay'

afterEach(() => {
  hideAllOverlays()
  cleanup()
})

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

describe('Panel signal row expansion', () => {
  it('does not show details by default', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 10, duration: 1.5, stack: [{ file: 'App.tsx', line: 42, col: 7, fnName: 'click' }] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).not.toContain('App.tsx')
    cleanup()
  })

  it('reveals stack frames when a forced-reflow row is clicked', () => {
    const result = makeResult([
      { kind: 'forced-reflow', at: 10, duration: 1.5, stack: [{ file: 'App.tsx', line: 42, col: 7, fnName: 'click' }] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const row = container.querySelector('li')!
    fireEvent.click(row)
    expect(container.textContent).toContain('App.tsx:42')
    expect(container.textContent).toContain('click')
    cleanup()
  })

  it('shows full URL for network signal on expand', () => {
    const result = makeResult([
      { kind: 'network', url: 'https://example.com/long/path/that/is/usually/cut', startedAt: 0, duration: 30, size: 1024, blocking: true },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    fireEvent.click(container.querySelector('li')!)
    expect(container.textContent).toContain('https://example.com/long/path/that/is/usually/cut')
    expect(container.textContent).toContain('blocking')
    cleanup()
  })

  it('shows render reason and duration on expand', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'Header', reason: 'state-change', duration: 4.2 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    fireEvent.click(container.querySelector('li')!)
    expect(container.textContent).toContain('state-change')
    cleanup()
  })

  it('only one row is expanded at a time', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'A', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'B', reason: 'commit', duration: 1 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rows = container.querySelectorAll('li')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!)
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(rows[1]!.getAttribute('aria-expanded')).toBe('true')
    cleanup()
  })
})

describe('Panel severity coloring', () => {
  it('renders web-vital with the value unit (ms for LCP) and a rating indicator', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'LCP', value: 2400 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).toMatch(/2400/)
    expect(container.textContent).toMatch(/ms/)
    expect(container.querySelector('[data-rating]')).toBeTruthy()
    cleanup()
  })

  it('renders CLS without ms unit and with rating from CLS thresholds', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'CLS', value: 0.08 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    expect(container.textContent).not.toMatch(/0\.08ms/)
    const rating = container.querySelector('[data-rating]')
    expect(rating?.getAttribute('data-rating')).toBe('good')
    cleanup()
  })

  it('marks long tasks > 100ms as severe', () => {
    const result = makeResult([
      { kind: 'long-task', at: 0, duration: 150, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rating = container.querySelector('[data-severity]')
    expect(rating?.getAttribute('data-severity')).toBe('high')
    cleanup()
  })

  it('marks long tasks 50-100ms as medium', () => {
    const result = makeResult([
      { kind: 'long-task', at: 0, duration: 75, stack: [] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const rating = container.querySelector('[data-severity]')
    expect(rating?.getAttribute('data-severity')).toBe('medium')
    cleanup()
  })
})

describe('Panel overlay integration', () => {
  it('shows overlay on layout-shift hover, hides on leave', () => {
    const rect = new DOMRect(10, 20, 100, 50)
    const result = makeResult([
      { kind: 'layout-shift', at: 0, value: 0.05, sources: [rect] },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const li = container.querySelector('li')!
    fireEvent.mouseEnter(li)
    expect(document.querySelector('[data-perfscope-overlay]')).toBeTruthy()
    fireEvent.mouseLeave(li)
    // Immediately after mouseLeave: overlay is fading, still in DOM
    const fading = document.querySelector('[data-perfscope-overlay]') as HTMLElement | null
    expect(fading).toBeTruthy()
    expect(fading!.style.opacity).toBe('0')
    cleanup()
  })
})

describe('Panel grouping toggle', () => {
  it('renders the grouping toggle on the render tab', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'A', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'B', reason: 'commit', duration: 1 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.queryByLabelText(/group by/i)).toBeTruthy()
    cleanup()
  })

  it('groups render signals by component when "component" is selected', () => {
    const result = makeResult([
      { kind: 'render', at: 0, component: 'App', reason: 'commit', duration: 1 },
      { kind: 'render', at: 1, component: 'App', reason: 'commit', duration: 2 },
      { kind: 'render', at: 2, component: 'Counter', reason: 'commit', duration: 1 },
    ])
    const { container } = render(<Panel result={result} onClose={() => {}} />)
    const select = screen.getByLabelText(/group by/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'component' } })
    expect(container.textContent).toMatch(/App.*×2/)
    expect(container.textContent).toMatch(/Counter.*×1/)
    cleanup()
  })

  it('does not show grouping toggle on tabs that do not support grouping', () => {
    const result = makeResult([
      { kind: 'web-vital', name: 'LCP', value: 100 },
    ])
    render(<Panel result={result} onClose={() => {}} />)
    expect(screen.queryByLabelText(/group by/i)).toBeNull()
    cleanup()
  })
})
