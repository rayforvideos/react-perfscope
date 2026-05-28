import React, { useRef, useState } from 'react'

const containerStyle: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: '720px',
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
      <h2 style={{ margin: '0 0 8px' }}>1. Counter (render)</h2>
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
      <h2 style={{ margin: '0 0 8px' }}>2. Layout shifter (layout-shift)</h2>
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

function ForcedReflowDemo() {
  const ref = useRef<HTMLDivElement>(null)
  function trigger() {
    const el = ref.current
    if (!el) return
    // Classic layout thrashing — read after write, repeatedly.
    for (let i = 0; i < 30; i++) {
      el.style.width = `${100 + (i % 10)}px`
      void el.offsetWidth
      el.style.height = `${20 + (i % 5)}px`
      void el.offsetHeight
    }
  }
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>3. Forced reflow (layout thrashing)</h2>
      <p>
        Click to thrash layout in a tight loop (write style, then read offsetWidth, ×30).
        Each read forces a synchronous layout — the forced-reflow collector catches every one
        and captures the call stack.
      </p>
      <button type="button" style={buttonStyle} onClick={trigger}>
        Trigger 30 forced reflows
      </button>
      <div
        ref={ref}
        style={{
          marginTop: '12px',
          width: '100px',
          height: '20px',
          background: '#fde68a',
          borderRadius: '4px',
        }}
      />
    </div>
  )
}

function LongTaskDemo() {
  function trigger() {
    // Synchronous busy-wait so the main thread blocks > 50ms.
    const target = performance.now() + 120
    let n = 0
    while (performance.now() < target) {
      n += Math.sqrt(Math.random() * 1000)
    }
    // Use n so the JIT doesn't optimize the loop away.
    if (n < 0) console.log(n)
  }
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>4. Long task (long-task)</h2>
      <p>
        Click to block the main thread for ~120ms (synchronous busy-wait).
        The long-task collector reports tasks &gt; 50ms.
      </p>
      <button type="button" style={buttonStyle} onClick={trigger}>
        Block main thread 120ms
      </button>
    </div>
  )
}

function NetworkDemo() {
  const [count, setCount] = useState(0)
  function trigger() {
    // Three parallel fetches of different sizes to a public placeholder API.
    void Promise.all([
      fetch('https://jsonplaceholder.typicode.com/posts/1').catch(() => null),
      fetch('https://jsonplaceholder.typicode.com/posts').catch(() => null),
      fetch('https://jsonplaceholder.typicode.com/users').catch(() => null),
    ]).then(() => setCount((c) => c + 1))
  }
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>5. Network requests (network)</h2>
      <p>
        Click to fire three parallel fetches. The network collector reports
        each request with URL, duration, size, and render-blocking status.
      </p>
      <button type="button" style={buttonStyle} onClick={trigger}>
        Fetch 3 resources
      </button>
      <span style={{ color: '#666', fontSize: '12px' }}>fired: {count} time(s)</span>
    </div>
  )
}

function WebVitalsNote() {
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 8px' }}>6. Web vitals + paint (auto)</h2>
      <p style={{ marginBottom: 0 }}>
        Web vitals (LCP / FCP / CLS / INP / TTFB) and paint events fire automatically
        as you interact with the page. No button needed — they appear in their own
        tabs after you stop the recording.
      </p>
    </div>
  )
}

export function App() {
  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: '8px' }}>react-perfscope demo</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Click the floating widget in the bottom-right to start recording.
        Trigger any of the demos below, then click the widget again to stop and inspect the panel.
      </p>
      <Counter />
      <LayoutShifter />
      <ForcedReflowDemo />
      <LongTaskDemo />
      <NetworkDemo />
      <WebVitalsNote />
    </div>
  )
}
