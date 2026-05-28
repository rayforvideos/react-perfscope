import { describe, it, expect } from 'vitest'
import { parseStack } from '../src/sourcemap'

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
