import { TraceMap, originalPositionFor, type SourceMapInput } from '@jridgewell/trace-mapping'
import type { StackFrame } from './types'
import { markSelfRequest } from './self-requests'

const CHROME_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/
const FIREFOX_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/

/** A parsed source map (the JSON object), as returned by a FetchMap. */
export type RawSourceMap = SourceMapInput

export type FetchMap = (file: string) => Promise<RawSourceMap | null>

function lookupFrame(tracer: TraceMap, frame: StackFrame): StackFrame {
  // Stack-trace columns (Chrome and Firefox alike) are 1-based, while source
  // map segments store 0-based columns — shift on the way in and back out.
  // In minified bundles one column is often a whole identifier, so an
  // off-by-one maps to the wrong token.
  const pos = originalPositionFor(tracer, { line: frame.line, column: frame.col - 1 })
  if (pos.source == null || pos.line == null || pos.column == null) {
    return frame
  }
  const resolved: StackFrame = {
    file: pos.source,
    line: pos.line,
    col: pos.column + 1,
  }
  if (pos.name) resolved.fnName = pos.name
  else if (frame.fnName) resolved.fnName = frame.fnName
  return resolved
}

export async function resolveFrame(
  frame: StackFrame,
  fetchMap: FetchMap
): Promise<StackFrame> {
  try {
    const map = await fetchMap(frame.file)
    if (!map) return frame
    // trace-mapping is pure JS (no wasm), so this works in the browser where
    // Mozilla's source-map SourceMapConsumer needs an explicitly-initialized
    // mappings.wasm.
    return lookupFrame(new TraceMap(map), frame)
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
 * Caches the DECODED TraceMap per source URL — decoding the mappings is the
 * expensive step, so repeated resolves against the same file are O(log n)
 * lookups after the first.
 *
 * Returns the input frame on any failure (network error, missing map, etc.).
 */
export function createSourceMapResolver(opts: CreateSourceMapResolverOptions = {}): SourceMapResolver {
  const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null)
  const cache = new Map<string, Promise<TraceMap | null>>()

  function fetchTracerFor(sourceUrl: string): Promise<TraceMap | null> {
    if (!f) return Promise.resolve(null)
    const existing = cache.get(sourceUrl)
    if (existing) return existing
    const promise = (async () => {
      try {
        markSelfRequest(sourceUrl)
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : (globalThis as any).Buffer.from(payload, 'base64').toString('utf8')
            : decodeURIComponent(payload)
          return new TraceMap(JSON.parse(decoded) as RawSourceMap)
        }
        const mapUrl = new URL(ref, sourceUrl).href
        markSelfRequest(mapUrl)
        const mapRes = await f(mapUrl)
        if (!mapRes || !mapRes.ok) return null
        return new TraceMap((await mapRes.json()) as RawSourceMap)
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
        const tracer = await fetchTracerFor(frame.file)
        if (!tracer) return frame
        return lookupFrame(tracer, frame)
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
