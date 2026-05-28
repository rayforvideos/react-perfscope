import { h } from 'preact'
import type { RecordingResult } from '@react-perfscope/core'
import type { WidgetPosition } from './types'

export interface PanelProps {
  result: RecordingResult
  position?: WidgetPosition
  onClose: () => void
}

export function Panel(props: PanelProps) {
  return (
    <div role="region" aria-label="react-perfscope panel">
      <button type="button" aria-label="Close panel" onClick={props.onClose}>×</button>
      <div>{props.result.signals.length} signals</div>
    </div>
  )
}
