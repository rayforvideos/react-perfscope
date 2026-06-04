import { h } from 'preact'
import type { EpisodeMember } from '@react-perfscope/core'

export function memberLabel(m: EpisodeMember): string {
  const s = m.signal
  if (s.kind === 'render') return `${s.component} (${s.reason})`
  if (s.kind === 'forced-reflow') {
    const top = s.stack[0]
    return top ? `forced reflow · ${top.file}:${top.line}` : 'forced reflow'
  }
  return `layout shift ${s.value.toFixed(3)}`
}

/** One cross-signal member of an episode: its label, the render commit that
 * caused it (when attributed), and a confidence badge. Shared by the
 * interaction (INP) and long-task episode views. */
export function EpisodeMemberRow({ member }: { member: EpisodeMember }) {
  return (
    <div
      data-member-kind={member.signal.kind}
      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '1px 0', color: '#ccc' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {memberLabel(member)}
      </span>
      {member.causedBy && (
        <span style={{ flex: '0 0 auto', color: '#888' }}>← {member.causedBy.component}</span>
      )}
      {member.confidence === 'caused' && (
        <span
          style={{
            flex: '0 0 auto',
            fontSize: '9px',
            color: '#e0a030',
            border: '1px solid #5a4410',
            borderRadius: '3px',
            padding: '0 4px',
          }}
        >
          caused
        </span>
      )}
    </div>
  )
}

export function EpisodeMemberList({ members }: { members: EpisodeMember[] }) {
  if (members.length === 0) return <span style={{ color: '#555' }}>—</span>
  return (
    <>
      {members.map((m, i) => (
        <EpisodeMemberRow key={i} member={m} />
      ))}
    </>
  )
}
