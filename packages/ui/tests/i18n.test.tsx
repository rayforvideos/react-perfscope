import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { h } from 'preact'
import type { RecordingResult, Signal } from '@react-perfscope/core'
import { Panel } from '../src/panel'
import { I18nProvider, STRINGS, readStoredLang, STORAGE_KEY } from '../src/i18n'
import { hideAllOverlays } from '../src/overlay'

afterEach(() => {
  hideAllOverlays()
  cleanup()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
})

function makeResult(signals: Signal[]): RecordingResult {
  return { signals, startedAt: 0, duration: 1000 }
}

describe('i18n strings', () => {
  it('en and ko expose the same keys', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.ko).sort())
  })
})

describe('readStoredLang', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  })

  it('defaults to en when nothing stored', () => {
    expect(readStoredLang()).toBe('en')
  })

  it('reads a previously stored language', () => {
    localStorage.setItem(STORAGE_KEY, 'ko')
    expect(readStoredLang()).toBe('ko')
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'fr')
    expect(readStoredLang()).toBe('en')
  })
})

describe('Panel language toggle', () => {
  it('defaults to English (Save button text)', () => {
    const { container } = render(
      <I18nProvider>
        <Panel result={makeResult([])} onClose={() => {}} />
      </I18nProvider>,
    )
    expect(container.textContent).toContain('Save')
    cleanup()
  })

  it('switches UI to Korean when the 한 toggle is clicked', () => {
    const { container } = render(
      <I18nProvider>
        <Panel result={makeResult([])} onClose={() => {}} />
      </I18nProvider>,
    )
    fireEvent.click(container.querySelector('[data-lang="ko"]')!)
    expect(container.textContent).toContain(STRINGS.ko.save)
    expect(container.textContent).toContain(STRINGS.ko.noSignals)
    cleanup()
  })

  it('persists the selected language to localStorage', () => {
    const { container } = render(
      <I18nProvider>
        <Panel result={makeResult([])} onClose={() => {}} />
      </I18nProvider>,
    )
    fireEvent.click(container.querySelector('[data-lang="ko"]')!)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ko')
    cleanup()
  })
})
