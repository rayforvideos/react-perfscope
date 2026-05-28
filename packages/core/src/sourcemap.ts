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
