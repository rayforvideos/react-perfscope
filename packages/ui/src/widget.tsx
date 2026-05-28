import { h } from 'preact'
import type { WidgetPosition } from './types'

export interface WidgetProps {
  recording: boolean
  elapsedMs?: number
  onToggle: () => void
  position?: WidgetPosition
}

const POSITION_STYLES: Record<WidgetPosition, Record<string, string>> = {
  'bottom-right': { bottom: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'top-left': { top: '16px', left: '16px' },
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function Widget(props: WidgetProps) {
  const { recording, elapsedMs = 0, onToggle, position = 'bottom-right' } = props
  const positionStyle = POSITION_STYLES[position]

  return (
    <div
      data-position={position}
      style={{
        position: 'fixed',
        ...positionStyle,
        zIndex: '2147483647',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: '#1a1a1a',
          color: '#e6e6e6',
          border: '1px solid #2a2a2a',
          borderRadius: '20px',
          padding: '8px 14px',
          fontSize: '12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: recording ? '#ff3b30' : '#666',
            display: 'inline-block',
          }}
        />
        {recording ? formatElapsed(elapsedMs) : 'rec'}
      </button>
    </div>
  )
}
