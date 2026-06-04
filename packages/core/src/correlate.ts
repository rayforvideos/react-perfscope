import type { InteractionSignal, LongTaskSignal, Signal, StackFrame } from './types'

export type AnchorSignal = InteractionSignal | LongTaskSignal

/** How strongly a member is linked to its episode anchor. `caused` means a
 * member's source location matches one of the anchor's hot frames — a real
 * causal claim. `co-occurred` means it only overlapped in time; the link is
 * temporal, not proven. The distinction keeps the tool from overclaiming. */
export type LinkConfidence = 'caused' | 'co-occurred'

/** Which slice of an interaction's INP latency a member fell into. Only set
 * for interaction-anchored episodes; long tasks have no phase breakdown. */
export type InpPhase = 'input-delay' | 'processing' | 'presentation'

/** Signals that carry an `at` timestamp and can be nested inside an episode.
 * Excludes the anchors themselves and signals with no point in time
 * (web-vital has no `at`; network uses `startedAt`). */
type MemberSignal = Exclude<Extract<Signal, { at: number }>, AnchorSignal>

export type EpisodeMember = {
  signal: MemberSignal
  confidence: LinkConfidence
  phase?: InpPhase
}

export type Episode = {
  anchor: AnchorSignal
  members: EpisodeMember[]
}

function isAnchor(signal: Signal): signal is AnchorSignal {
  return signal.kind === 'interaction' || signal.kind === 'long-task'
}

function sourceKey(frame: StackFrame): string {
  return `${frame.file}:${frame.line}`
}

function anchorHotLocations(anchor: AnchorSignal): Set<string> {
  return new Set((anchor.attribution ?? []).map((a) => sourceKey(a.frame)))
}

function isMember(s: Signal, anchor: AnchorSignal): s is MemberSignal {
  return s !== anchor && s.kind !== 'interaction' && s.kind !== 'long-task' && 'at' in s
}

function linkConfidence(signal: MemberSignal, hotLocations: Set<string>): LinkConfidence {
  if (signal.kind === 'forced-reflow') {
    if (signal.stack.some((f) => hotLocations.has(sourceKey(f)))) return 'caused'
  }
  return 'co-occurred'
}

function inpPhaseAt(anchor: AnchorSignal, at: number): InpPhase | undefined {
  if (anchor.kind !== 'interaction') return undefined
  const processingStart = anchor.at + anchor.inputDelay
  const presentationStart = processingStart + anchor.processing
  if (at < processingStart) return 'input-delay'
  if (at < presentationStart) return 'processing'
  return 'presentation'
}

export function correlate(signals: Signal[]): Episode[] {
  const anchors = signals.filter(isAnchor)

  return anchors.map((anchor) => {
    const start = anchor.at
    const end = anchor.at + anchor.duration
    const hotLocations = anchorHotLocations(anchor)
    const members = signals
      .filter((s): s is MemberSignal => isMember(s, anchor) && s.at >= start && s.at <= end)
      .map((signal) => ({
        signal,
        confidence: linkConfidence(signal, hotLocations),
        phase: inpPhaseAt(anchor, signal.at),
      }))

    return { anchor, members }
  })
}
