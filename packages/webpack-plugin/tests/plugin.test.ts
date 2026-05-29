import { describe, it, expect } from 'vitest'
import { ReactPerfscopePlugin } from '../src/index'

type Headers = Record<string, string> | Array<{ key: string; value: string }>

interface FakeCompiler {
  options: { mode?: 'production' | 'development' | 'none'; devServer?: { headers?: Headers } }
  context: string
  webpack: { EntryPlugin: { new (context: string, entry: string, options: object): { apply: (c: FakeCompiler) => void } } }
}

function makeCompiler(
  mode: 'production' | 'development' | 'none' | undefined,
  devServer?: { headers?: Headers }
): FakeCompiler {
  const applies: Array<{ context: string; entry: string }> = []
  const FakeEntryPlugin = class {
    constructor(public context: string, public entry: string, public options: object) {}
    apply(c: FakeCompiler) {
      applies.push({ context: this.context, entry: this.entry })
      void c
    }
  }
  const compiler: FakeCompiler = {
    options: { mode, ...(devServer !== undefined ? { devServer } : {}) },
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

  it('injects the js-profiling Document-Policy header in development mode', () => {
    const compiler = makeCompiler('development')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer?.headers).toEqual({ 'Document-Policy': 'js-profiling' })
  })

  it('does not touch devServer config in production mode', () => {
    const compiler = makeCompiler('production')
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer).toBeUndefined()
  })

  it('preserves a user-set Document-Policy header (object form)', () => {
    const compiler = makeCompiler('development', { headers: { 'Document-Policy': 'custom' } })
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer?.headers).toEqual({ 'Document-Policy': 'custom' })
  })

  it('merges into existing object-form headers', () => {
    const compiler = makeCompiler('development', { headers: { 'X-Foo': 'bar' } })
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer?.headers).toEqual({
      'X-Foo': 'bar',
      'Document-Policy': 'js-profiling',
    })
  })

  it('appends to array-form headers when absent', () => {
    const compiler = makeCompiler('development', { headers: [{ key: 'X-Foo', value: 'bar' }] })
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer?.headers).toEqual([
      { key: 'X-Foo', value: 'bar' },
      { key: 'Document-Policy', value: 'js-profiling' },
    ])
  })

  it('leaves array-form headers alone when Document-Policy already present', () => {
    const compiler = makeCompiler('development', {
      headers: [{ key: 'Document-Policy', value: 'custom' }],
    })
    new ReactPerfscopePlugin().apply(compiler as never)
    expect(compiler.options.devServer?.headers).toEqual([
      { key: 'Document-Policy', value: 'custom' },
    ])
  })
})
