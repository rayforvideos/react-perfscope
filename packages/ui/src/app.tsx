import { h } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { Recorder, RecordingResult, StackFrame } from '@react-perfscope/core'
import { Widget } from './widget'
import { Panel } from './panel'
import { I18nProvider } from './i18n'
import type { WidgetPosition } from './types'

export interface AppProps {
  recorder: Recorder
  position?: WidgetPosition
  resolveFrame?: (frame: StackFrame) => Promise<StackFrame>
  finalize?: (result: RecordingResult) => Promise<RecordingResult>
}

export function App(props: AppProps) {
  const { recorder, position = 'bottom-right', resolveFrame, finalize } = props
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  // Bumped on every stop; lets a slow finalize drop its result if the user
  // has already started a new recording.
  const resultTokenRef = useRef<number>(0)

  useEffect(() => {
    if (!recording) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      // Quantize to the displayed second: setState with an unchanged value
      // lets preact bail out, so the widget re-renders once per second
      // instead of every frame — this runs inside the window being measured.
      const elapsed = performance.now() - startedAtRef.current
      setElapsedMs(Math.floor(elapsed / 1000) * 1000)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [recording])

  function onToggle() {
    if (!recording) {
      startedAtRef.current = performance.now()
      setElapsedMs(0)
      setResult(null)
      recorder.start()
      setRecording(true)
    } else {
      const r = recorder.stop()
      const token = ++resultTokenRef.current
      setRecording(false)
      setResult(r)
      if (finalize) {
        finalize(r)
          .then((enriched) => {
            if (resultTokenRef.current === token) setResult(enriched)
          })
          .catch(() => {})
      }
    }
  }

  function onClose() {
    setResult(null)
  }

  return (
    <I18nProvider>
      {result === null && (
        <Widget
          recording={recording}
          elapsedMs={elapsedMs}
          onToggle={onToggle}
          position={position}
        />
      )}
      {result !== null && (
        <Panel result={result} position={position} onClose={onClose} resolveFrame={resolveFrame} />
      )}
    </I18nProvider>
  )
}
