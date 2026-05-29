import { render, type ComponentChild } from 'preact'

const HOST_MARKER = 'data-perfscope-host'

// Thin dark scrollbar matching the panel palette. Pseudo-elements like
// ::-webkit-scrollbar can't be set via inline styles, so we inject a
// <style> element into the shadow root. scrollbar-width/-color cover Firefox.
const SCROLLBAR_CSS = `
*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: #555;
  background-clip: padding-box;
  border: 2px solid transparent;
}
*::-webkit-scrollbar-corner {
  background: transparent;
}
/* Firefox-only fallback. Chrome 121+ supports the standard scrollbar-width/
   -color too, but setting them there DISABLES the ::-webkit-scrollbar styling
   above (losing our 8px rounded thumb). Gate on lack of webkit support so only
   non-webkit engines (Firefox) pick these up. */
@supports not selector(::-webkit-scrollbar) {
  * {
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
  }
}
`

export interface MountShadowOptions {
  /** Parent element under which the host div is appended. Defaults to document.body. */
  parent?: HTMLElement
}

export function mountShadow(vnode: ComponentChild, opts: MountShadowOptions = {}): () => void {
  const parent = opts.parent ?? document.body
  const host = document.createElement('div')
  host.setAttribute(HOST_MARKER, '')
  const root = host.attachShadow({ mode: 'open' })
  parent.appendChild(host)
  render(vnode, root as unknown as Element)
  // Append after render: preact manages its own children in `root`, so adding
  // the <style> afterward keeps it outside preact's diff and prevents it from
  // being removed on re-render.
  const style = document.createElement('style')
  style.textContent = SCROLLBAR_CSS
  root.appendChild(style)

  let torn = false
  return () => {
    if (torn) return
    torn = true
    try {
      render(null, root as unknown as Element)
    } catch {
      // ignore
    }
    if (host.parentNode) host.parentNode.removeChild(host)
  }
}
