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
