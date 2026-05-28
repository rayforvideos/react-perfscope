import { h } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { Recorder, RecordingResult } from '@react-perfscope/core'
import { Widget } from './widget'
import { Panel } from './panel'
import type { WidgetPosition } from './types'

export interface AppProps {
  recorder: Recorder
  position?: WidgetPosition
}

export function App(props: AppProps) {
  const { recorder, position = 'bottom-right' } = props
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!recording) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      setElapsedMs(performance.now() - startedAtRef.current)
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
      setRecording(false)
      setResult(r)
    }
  }

  function onClose() {
    setResult(null)
  }

  return (
    <>
      {result === null && (
        <Widget
          recording={recording}
          elapsedMs={elapsedMs}
          onToggle={onToggle}
          position={position}
        />
      )}
      {result !== null && (
        <Panel result={result} position={position} onClose={onClose} />
      )}
    </>
  )
}
