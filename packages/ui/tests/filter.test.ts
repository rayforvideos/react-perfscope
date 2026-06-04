import { describe, it, expect } from 'vitest'
import { signalSearchText, signalMatchesFilter } from '../src/filter'
import type { Signal } from '@react-perfscope/core'

const render = (component: string, memberNames?: string[]): Signal => ({
  kind: 'render',
  at: 0,
  component,
  reason: 'mount',
  commitId: 0,
  depth: 0,
  duration: 0,
  ...(memberNames
    ? {
        members: memberNames.map((name) => ({
          kind: 'render' as const,
          at: 0,
          component: name,
          reason: 'parent' as const,
          commitId: 0,
          depth: 1,
          duration: 0,
        })),
      }
    : {}),
})

const network = (url: string): Signal => ({ kind: 'network', url, startedAt: 0, duration: 0, size: 0, blocking: false })
const webVital = (name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'): Signal => ({ kind: 'web-vital', name, value: 0 })
const forcedReflow = (fnName: string, file: string): Signal => ({ kind: 'forced-reflow', at: 0, duration: 0, stack: [{ file, line: 1, col: 1, fnName }] })

describe('signalMatchesFilter', () => {
  it('matches everything when the query is empty or whitespace', () => {
    expect(signalMatchesFilter(network('https://api/x'), '')).toBe(true)
    expect(signalMatchesFilter(network('https://api/x'), '   ')).toBe(true)
  })

  it('matches a render signal by component name, case-insensitively', () => {
    expect(signalMatchesFilter(render('UserProfile'), 'profile')).toBe(true)
    expect(signalMatchesFilter(render('UserProfile'), 'PROFILE')).toBe(true)
    expect(signalMatchesFilter(render('UserProfile'), 'cart')).toBe(false)
  })

  it('matches a render commit by a member component name', () => {
    const commit = render('App', ['CheckoutButton'])
    expect(signalMatchesFilter(commit, 'checkout')).toBe(true)
  })

  it('matches a network signal by URL substring', () => {
    expect(signalMatchesFilter(network('https://cdn.example.com/avatar.png'), 'avatar')).toBe(true)
    expect(signalMatchesFilter(network('https://cdn.example.com/avatar.png'), '.png')).toBe(true)
  })

  it('matches a web-vital by its metric name', () => {
    expect(signalMatchesFilter(webVital('LCP'), 'lcp')).toBe(true)
    expect(signalMatchesFilter(webVital('LCP'), 'inp')).toBe(false)
  })

  it('matches a forced-reflow by its top stack frame function or file', () => {
    const fr = forcedReflow('measureWidth', 'src/App.tsx')
    expect(signalMatchesFilter(fr, 'measurewidth')).toBe(true)
    expect(signalMatchesFilter(fr, 'app.tsx')).toBe(true)
  })
})

describe('signalSearchText', () => {
  it('returns lowercased text', () => {
    expect(signalSearchText(render('FooBar'))).toBe('foobar')
  })
})
