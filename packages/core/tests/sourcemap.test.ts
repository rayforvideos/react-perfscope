import { describe, it, expect } from 'vitest'
import { parseStack, resolveFrame, type RawSourceMap } from '../src/sourcemap'

describe('parseStack', () => {
  it('parses V8/Chrome stack format', () => {
    const raw = `Error
    at doWork (http://localhost:3000/src/app.ts:42:13)
    at handle (http://localhost:3000/src/main.ts:7:5)`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
      { fnName: 'handle', file: 'http://localhost:3000/src/main.ts', line: 7, col: 5 },
    ])
  })

  it('parses anonymous frames (no fnName)', () => {
    const raw = `Error
    at http://localhost:3000/src/app.ts:42:13`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
    ])
  })

  it('parses Firefox/Safari stack format', () => {
    const raw = `doWork@http://localhost:3000/src/app.ts:42:13
handle@http://localhost:3000/src/main.ts:7:5`
    const frames = parseStack(raw)
    expect(frames).toEqual([
      { fnName: 'doWork', file: 'http://localhost:3000/src/app.ts', line: 42, col: 13 },
      { fnName: 'handle', file: 'http://localhost:3000/src/main.ts', line: 7, col: 5 },
    ])
  })

  it('returns empty array for empty/undefined stack', () => {
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack('')).toEqual([])
  })

  it('skips lines that do not look like frames', () => {
    const raw = `Error: boom
    some garbage line
    at doWork (http://localhost:3000/src/app.ts:42:13)`
    const frames = parseStack(raw)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.fnName).toBe('doWork')
  })
})

// Minimal hand-crafted source map: bundled.js generated col 0 (0-based) →
// src.ts line 5, col 2 (0-based). Stack-trace frames are 1-based, so a frame
// pointing at that token reads col 3 after resolution.
const TEST_MAP: RawSourceMap = {
  version: 3,
  sources: ['src.ts'],
  names: ['doWork'],
  mappings: 'AAIEA',
  file: 'bundled.js',
}

// Two segments on one generated line: genCol 0 → (line 1, col 0, 'first') and
// genCol 4 → (line 2, col 8, 'second'), all 0-based in the map.
const BOUNDARY_MAP: RawSourceMap = {
  version: 3,
  sources: ['src.ts'],
  names: ['first', 'second'],
  mappings: 'AAAAA,IACQC',
  file: 'bundled.js',
}

describe('resolveFrame', () => {
  it('resolves a minified frame to original via source map', async () => {
    const resolved = await resolveFrame(
      { file: 'http://x/bundled.js', line: 1, col: 4, fnName: 'doWork' },
      async () => TEST_MAP
    )
    expect(resolved.file).toBe('src.ts')
    expect(resolved.line).toBe(5)
    expect(resolved.col).toBe(3)
  })

  it('treats stack-trace columns as 1-based when looking up 0-based map segments', async () => {
    // Stack col 4 (1-based) is generated col 3 (0-based) — still inside the
    // FIRST segment. An off-by-one lookup (passing 4 straight through) lands
    // on the second segment at genCol 4 and misattributes the frame.
    const resolved = await resolveFrame(
      { file: 'http://x/bundled.js', line: 1, col: 4 },
      async () => BOUNDARY_MAP
    )
    expect(resolved.fnName).toBe('first')
    expect(resolved.line).toBe(1)
    expect(resolved.col).toBe(1)
  })

  it('returns 1-based columns for resolved frames', async () => {
    // Stack col 5 (1-based) = generated col 4 (0-based) → second segment,
    // original col 8 (0-based) → 9 (1-based).
    const resolved = await resolveFrame(
      { file: 'http://x/bundled.js', line: 1, col: 5 },
      async () => BOUNDARY_MAP
    )
    expect(resolved.fnName).toBe('second')
    expect(resolved.line).toBe(2)
    expect(resolved.col).toBe(9)
  })

  it('returns the input unchanged when fetchMap returns null', async () => {
    const input = { file: 'http://x/bundled.js', line: 1, col: 4 }
    const resolved = await resolveFrame(input, async () => null)
    expect(resolved).toEqual(input)
  })

  it('returns the input unchanged when fetchMap throws', async () => {
    const input = { file: 'http://x/bundled.js', line: 1, col: 4 }
    const resolved = await resolveFrame(input, async () => {
      throw new Error('network fail')
    })
    expect(resolved).toEqual(input)
  })
})
