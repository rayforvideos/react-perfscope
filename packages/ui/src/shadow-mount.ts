import { render, type ComponentChild } from 'preact'

const HOST_MARKER = 'data-perfscope-host'

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
