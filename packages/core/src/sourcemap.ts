import { SourceMapConsumer, type RawSourceMap } from 'source-map'
import type { StackFrame } from './types'

const CHROME_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/
const FIREFOX_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/

export type FetchMap = (file: string) => Promise<RawSourceMap | null>

export async function resolveFrame(
  frame: StackFrame,
  fetchMap: FetchMap
): Promise<StackFrame> {
  try {
    const map = await fetchMap(frame.file)
    if (!map) return frame
    const consumer = await new SourceMapConsumer(map)
    try {
      const pos = consumer.originalPositionFor({
        line: frame.line,
        column: frame.col,
      })
      if (pos.source == null || pos.line == null || pos.column == null) {
        return frame
      }
      const resolved: StackFrame = {
        file: pos.source,
        line: pos.line,
        col: pos.column,
      }
      if (pos.name) resolved.fnName = pos.name
      else if (frame.fnName) resolved.fnName = frame.fnName
      return resolved
    } finally {
      consumer.destroy()
    }
  } catch (err) {
    console.warn('[react-perfscope] resolveFrame failed:', err)
    return frame
  }
}

/**
 * Attach a lazy `stack` getter to `target` that parses `raw` on first access
 * and memoizes the result. Use this from collectors to defer parseStack cost
 * until a consumer actually reads `signal.stack`.
 *
 * `skipTopFrames` drops the leading N parsed frames — useful for collectors
 * that wrap a patched function (the wrapper itself shows up as the topmost
 * frame, but it's noise from the user's perspective).
 */
export function attachLazyStack(
  target: object,
  raw: string | undefined,
  skipTopFrames = 0
): void {
  let cached: StackFrame[] | null = null
  Object.defineProperty(target, 'stack', {
    enumerable: true,
    configurable: true,
    get() {
      if (cached === null) {
        const all = parseStack(raw)
        cached = skipTopFrames > 0 ? all.slice(skipTopFrames) : all
      }
      return cached
    },
  })
}

export interface SourceMapResolver {
  /** Resolve a parsed StackFrame to its original source position. Falls back to the input frame on any failure. */
  resolve(frame: StackFrame): Promise<StackFrame>
}

export interface CreateSourceMapResolverOptions {
  /** Override the global fetch. Useful for tests and non-browser environments. */
  fetch?: typeof globalThis.fetch
}

/**
 * Create a SourceMap resolver that fetches `.map` files from the live URL
 * referenced in each source file's `//# sourceMappingURL=` directive.
 * Caches the parsed source map per source URL so repeated resolves against
 * the same file are O(1) after the first.
 *
 * Returns the input frame on any failure (network error, missing map, etc.).
 */
export function createSourceMapResolver(opts: CreateSourceMapResolverOptions = {}): SourceMapResolver {
  const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null)
  const cache = new Map<string, Promise<RawSourceMap | null>>()

  function fetchMapFor(sourceUrl: string): Promise<RawSourceMap | null> {
    if (!f) return Promise.resolve(null)
    const existing = cache.get(sourceUrl)
    if (existing) return existing
    const promise = (async () => {
      try {
        const res = await f(sourceUrl)
        if (!res || !res.ok) return null
        const text = await res.text()
        const m = text.match(/\/\/[#@]\s*sourceMappingURL=(.+?)\s*$/m)
        if (!m) return null
        const ref = m[1]!.trim()
        if (ref.startsWith('data:')) {
          const commaIdx = ref.indexOf(',')
          if (commaIdx === -1) return null
          const header = ref.slice(0, commaIdx)
          const payload = ref.slice(commaIdx + 1)
          const decoded = header.includes('base64')
            ? typeof atob === 'function'
              ? atob(payload)
              : Buffer.from(payload, 'base64').toString('utf8')
            : decodeURIComponent(payload)
          return JSON.parse(decoded) as RawSourceMap
        }
        const mapUrl = new URL(ref, sourceUrl).href
        const mapRes = await f(mapUrl)
        if (!mapRes || !mapRes.ok) return null
        return (await mapRes.json()) as RawSourceMap
      } catch {
        return null
      }
    })()
    cache.set(sourceUrl, promise)
    return promise
  }

  return {
    async resolve(frame) {
      try {
        return await resolveFrame(frame, fetchMapFor)
      } catch {
        return frame
      }
    },
  }
}

export function parseStack(raw: string | undefined): StackFrame[] {
  if (!raw) return []
  const frames: StackFrame[] = []
  for (const line of raw.split('\n')) {
    const chromeMatch = line.match(CHROME_FRAME)
    if (chromeMatch) {
      const [, fnName, file, lineStr, colStr] = chromeMatch
      const frame: StackFrame = {
        file: file ?? '',
        line: Number(lineStr),
        col: Number(colStr),
      }
      if (fnName) frame.fnName = fnName
      frames.push(frame)
      continue
    }
    const firefoxMatch = line.match(FIREFOX_FRAME)
    if (firefoxMatch) {
      const [, fnName, file, lineStr, colStr] = firefoxMatch
      const frame: StackFrame = {
        file: file ?? '',
        line: Number(lineStr),
        col: Number(colStr),
      }
      if (fnName) frame.fnName = fnName
      frames.push(frame)
    }
  }
  return frames
}
