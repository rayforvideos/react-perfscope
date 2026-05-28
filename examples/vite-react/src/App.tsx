import React, { useState } from 'react'

const containerStyle: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: '640px',
  margin: '64px auto',
  padding: '24px',
  lineHeight: 1.5,
  color: '#222',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e6e6e6',
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '16px',
  background: '#fafafa',
}

const buttonStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#fff',
  border: 0,
  borderRadius: '6px',
  padding: '8px 14px',
  cursor: 'pointer',
  marginRight: '8px',
}

function Counter() {
  const [n, setN] = useState(0)
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>Counter</h2>
      <p>Each click re-renders this component. The render collector captures each commit.</p>
      <button type="button" style={buttonStyle} onClick={() => setN(n + 1)}>
        count: {n}
      </button>
    </div>
  )
}

function LayoutShifter() {
  const [tall, setTall] = useState(false)
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>Layout shifter</h2>
      <p>
        Click to insert a tall block above the following text — produces a layout-shift signal.
        Hover the signal in the perfscope panel to see the source region highlighted.
      </p>
      <button type="button" style={buttonStyle} onClick={() => setTall((v) => !v)}>
        {tall ? 'Remove tall block' : 'Insert tall block'}
      </button>
      {tall && (
        <div
          style={{
            background: '#cbd5e1',
            height: '120px',
            marginTop: '16px',
            borderRadius: '6px',
          }}
        />
      )}
      <p style={{ marginTop: '16px' }}>This paragraph moves when the tall block is inserted.</p>
    </div>
  )
}

export function App() {
  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: '8px' }}>react-perfscope demo</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Click the floating widget in the bottom-right to start recording. Interact below, then click again to stop.
      </p>
      <Counter />
      <LayoutShifter />
    </div>
  )
}
