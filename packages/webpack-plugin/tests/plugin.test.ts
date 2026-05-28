import { describe, it, expect } from 'vitest'
import { ReactPerfscopePlugin } from '../src/index'

interface FakeCompiler {
  options: { mode?: 'production' | 'development' | 'none' }
  context: string
  webpack: { EntryPlugin: { new (context: string, entry: string, options: object): { apply: (c: FakeCompiler) => void } } }
}

function makeCompiler(mode: 'production' | 'development' | 'none' | undefined): FakeCompiler {
  const applies: Array<{ context: string; entry: string }> = []
  const FakeEntryPlugin = class {
    constructor(public context: string, public entry: string, public options: object) {}
    apply(c: FakeCompiler) {
      applies.push({ context: this.context, entry: this.entry })
      void c
    }
  }
  const compiler: FakeCompiler = {
    options: { mode },
    context: '/fake/context',
    webpack: { EntryPlugin: FakeEntryPlugin as unknown as FakeCompiler['webpack']['EntryPlugin'] },
  }
  ;(compiler as { __applies?: typeof applies }).__applies = applies
  return compiler
}

function appliesOf(compiler: FakeCompiler): Array<{ context: string; entry: string }> {
  return (compiler as unknown as { __applies: Array<{ context: string; entry: string }> }).__applies
}

describe('ReactPerfscopePlugin (webpack)', () => {
  it('adds react-perfscope/auto as an entry in development mode', () => {
    const compiler = makeCompiler('development')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(1)
    expect(appliesOf(compiler)[0]!.entry).toBe('react-perfscope/auto')
  })

  it('is a no-op in production mode', () => {
    const compiler = makeCompiler('production')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(0)
  })

  it('is a no-op when mode is undefined (webpack defaults to production)', () => {
    const compiler = makeCompiler(undefined)
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(appliesOf(compiler)).toHaveLength(0)
  })

  it('accepts options object (reserved for Phase 6)', () => {
    expect(() => new ReactPerfscopePlugin({})).not.toThrow()
  })
})
