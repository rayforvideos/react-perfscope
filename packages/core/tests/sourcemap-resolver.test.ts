import { describe, it, expect, vi } from 'vitest'
import { createSourceMapResolver } from '../src/sourcemap'

const traceMapConstructions = vi.hoisted(() => ({ count: 0 }))
vi.mock('@jridgewell/trace-mapping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jridgewell/trace-mapping')>()
  class CountingTraceMap extends actual.TraceMap {
    constructor(...args: ConstructorParameters<typeof actual.TraceMap>) {
      super(...args)
      traceMapConstructions.count++
    }
  }
  return { ...actual, TraceMap: CountingTraceMap }
})

const TEST_MAP = {
  version: 3 as const,
  sources: ['original.ts'],
  names: ['doWork'],
  mappings: 'AAIEA', // line 5 (1-indexed), col 2
  file: 'bundled.js',
}

describe('createSourceMapResolver', () => {
  it('fetches the source map referenced by //# sourceMappingURL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/bundled.js') {
        return new Response(`console.log(1);\n//# sourceMappingURL=bundled.js.map`)
      }
      if (url === 'http://x/bundled.js.map') {
        return new Response(JSON.stringify(TEST_MAP))
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const resolved = await resolver.resolve({
      file: 'http://x/bundled.js',
      line: 1,
      col: 4,
      fnName: 'doWork',
    })
    expect(resolved.file).toBe('original.ts')
    expect(resolved.line).toBe(5)
    expect(resolved.col).toBe(3)
  })

  it('falls back to the original frame when no sourceMappingURL is present', async () => {
    const fetchMock = vi.fn(async () => new Response(`console.log(1);\n// no sourcemap`))
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/plain.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })

  it('falls back to the original frame when the .map fetch 404s', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/missing.js') {
        return new Response(`code\n//# sourceMappingURL=missing.js.map`)
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/missing.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })

  it('reuses the cached consumer on repeated resolves for the same file', async () => {
    let mapFetches = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/cached.js') {
        return new Response(`code\n//# sourceMappingURL=cached.js.map`)
      }
      if (url === 'http://x/cached.js.map') {
        mapFetches++
        return new Response(JSON.stringify(TEST_MAP))
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    await resolver.resolve({ file: 'http://x/cached.js', line: 1, col: 4 })
    await resolver.resolve({ file: 'http://x/cached.js', line: 1, col: 4 })
    expect(mapFetches).toBe(1)
  })

  it('decodes the source map once per file, not once per resolved frame', async () => {
    // TraceMap construction (mapping decode) is the expensive step — caching
    // only the raw JSON re-decodes the whole bundle map for every frame.
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/decoded.js') {
        return new Response(`code\n//# sourceMappingURL=decoded.js.map`)
      }
      if (url === 'http://x/decoded.js.map') {
        return new Response(JSON.stringify(TEST_MAP))
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    traceMapConstructions.count = 0
    await resolver.resolve({ file: 'http://x/decoded.js', line: 1, col: 4 })
    await resolver.resolve({ file: 'http://x/decoded.js', line: 1, col: 8 })
    await resolver.resolve({ file: 'http://x/decoded.js', line: 1, col: 12 })
    expect(traceMapConstructions.count).toBe(1)
  })

  it('handles inline data: URI source maps', async () => {
    const inlineJson = JSON.stringify(TEST_MAP)
    const base64 = Buffer.from(inlineJson).toString('base64')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://x/inline.js') {
        return new Response(
          `code\n//# sourceMappingURL=data:application/json;base64,${base64}`
        )
      }
      return new Response(null, { status: 404 })
    })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const resolved = await resolver.resolve({ file: 'http://x/inline.js', line: 1, col: 4 })
    expect(resolved.file).toBe('original.ts')
  })

  it('returns the original frame when fetch throws (network error)', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down') })
    const resolver = createSourceMapResolver({ fetch: fetchMock as never })
    const input = { file: 'http://x/oops.js', line: 1, col: 0 }
    const out = await resolver.resolve(input)
    expect(out).toEqual(input)
  })
})
