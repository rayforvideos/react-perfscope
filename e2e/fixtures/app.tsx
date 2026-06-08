import React, { Profiler, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'

// A minimal React app whose commits the harness drives programmatically.
// React's own Profiler supplies ground-truth commit durations to compare
// against perfscope's render collector.

type State = { tick: number; many: number; leakOn: boolean; leakKey: number }
let state: State = { tick: 0, many: 0, leakOn: false, leakKey: 0 }
const listeners = new Set<() => void>()

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
function getSnapshot(): State {
  return state
}

const commitDurations: number[] = []
function onRender(_id: string, _phase: string, actualDuration: number): void {
  commitDurations.push(actualDuration)
}

export function getCommitDurations(): number[] {
  return commitDurations.slice()
}
export function resetCommitDurations(): void {
  commitDurations.length = 0
}

function Leaf({ label }: { label: number }): React.JSX.Element {
  return <span className="leaf">{label}</span>
}

// Deliberately leaks: an interval that is never cleared keeps its callback
// alive, and the callback closes over `setN` (whose dispatch references this
// fiber's hook queue), so the fiber stays retained after unmount. The interval
// is set absurdly long so it never actually fires.
function Leaky(): React.JSX.Element {
  const [, setN] = useState(0)
  useEffect(() => {
    setInterval(() => setN((v) => v + 1), 10_000_000)
    // No cleanup — that's the leak.
  }, [])
  return <span className="leaky" />
}

function App(): React.JSX.Element {
  const s = useSyncExternalStore(subscribe, getSnapshot)
  const leaves: React.JSX.Element[] = []
  for (let i = 0; i < s.many; i++) leaves.push(<Leaf key={i} label={i + s.tick} />)
  return (
    <Profiler id="root" onRender={onRender}>
      <div id="tick">{s.tick}</div>
      <div id="leaves">{leaves}</div>
      <div id="leak-slot">{s.leakOn && <Leaky key={s.leakKey} />}</div>
    </Profiler>
  )
}

export function mountApp(): void {
  const el = document.getElementById('root')
  if (!el) throw new Error('fixtures: #root missing')
  createRoot(el).render(<App />)
}

export const store = { setState, getState: (): State => state }
