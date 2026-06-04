import type {
  ForcedReflowSignal,
  InteractionSignal,
  LongTaskSignal,
  RenderSignal,
  Signal,
  StackFrame,
} from './types'

/** One frame at 60fps. A commit's `at` is sampled when it completes (after its
 * layout effects), so a reflow forced during that commit finishes up to ~a
 * frame before the commit is timestamped. */
const FRAME_MS = 16

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

/** The render commit a forced reflow happened inside — the component whose
 * commit forced the synchronous layout. Set when the reflow's timestamp falls
 * within a render commit's window. */
export type CommitCause = {
  commitId: number
  component: string
}

export type EpisodeMember = {
  signal: MemberSignal
  confidence: LinkConfidence
  phase?: InpPhase
  causedBy?: CommitCause
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

/** Finds the render commit that forced a reflow. A render signal's `at` is
 * sampled when the commit completes — *after* its layout effects, where forced
 * reflows happen — and its `duration` covers only the render phase, not the
 * layout work. So the triggering commit is the one that completes at or just
 * after the reflow (within a frame of the reflow finishing), not one whose
 * narrow render-phase window contains it. */
function commitForReflow(reflow: ForcedReflowSignal, renders: RenderSignal[]): RenderSignal | undefined {
  const reflowEnd = reflow.at + reflow.duration
  return renders.find((r) => r.at >= reflow.at && r.at <= reflowEnd + FRAME_MS)
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
    const windowed = signals.filter(
      (s): s is MemberSignal => isMember(s, anchor) && s.at >= start && s.at <= end,
    )
    const renders = windowed.filter((s): s is RenderSignal => s.kind === 'render')

    const members = windowed.map((signal) => {
      const member: EpisodeMember = {
        signal,
        confidence: linkConfidence(signal, hotLocations),
        phase: inpPhaseAt(anchor, signal.at),
      }
      if (signal.kind === 'forced-reflow') {
        const commit = commitForReflow(signal, renders)
        if (commit) {
          member.confidence = 'caused'
          member.causedBy = { commitId: commit.commitId, component: commit.component }
        }
      }
      return member
    })

    return { anchor, members }
  })
}
