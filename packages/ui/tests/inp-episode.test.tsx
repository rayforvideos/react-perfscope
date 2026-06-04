import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/preact'
import type { Signal } from '@react-perfscope/core'
import { I18nProvider, STORAGE_KEY } from '../src/i18n'
import { InpEpisode } from '../src/inp-episode'

afterEach(() => {
  cleanup()
  localStorage.removeItem(STORAGE_KEY)
})

const interaction: Signal = {
  kind: 'interaction',
  at: 100,
  eventType: 'click',
  duration: 80,
  inputDelay: 10,
  processing: 40,
  presentation: 30,
}

describe('InpEpisode', () => {
  it('localizes phase labels to Korean', () => {
    localStorage.setItem(STORAGE_KEY, 'ko')
    const { container } = render(
      <I18nProvider>
        <InpEpisode signals={[interaction]} />
      </I18nProvider>,
    )
    expect(container.textContent).toContain('입력 지연')
    expect(container.textContent).toContain('처리')
    expect(container.textContent).toContain('화면 반영')
  })
})
