import { describe, it, expect } from 'vitest'
import reactPerfscope from '../src/index'

describe('reactPerfscope() vite plugin', () => {
  it('returns a Vite plugin object with the expected name', () => {
    const plugin = reactPerfscope()
    expect(plugin.name).toBe('react-perfscope')
  })

  it('applies only in dev (serve) mode', () => {
    const plugin = reactPerfscope()
    expect(plugin.apply).toBe('serve')
  })

  it('injects an auto-bootstrap script tag in transformIndexHtml', () => {
    const plugin = reactPerfscope()
    const transform = plugin.transformIndexHtml
    const raw =
      typeof transform === 'function'
        ? transform('<html><head></head><body></body></html>', { path: '/', filename: 'index.html', server: undefined as never } as never)
        : (transform as { handler: (html: string, ctx: never) => unknown }).handler(
            '<html><head></head><body></body></html>',
            { path: '/', filename: 'index.html', server: undefined as never } as never
          )
    // transformIndexHtml may return HtmlTagDescriptor[] directly or { tags: HtmlTagDescriptor[] }
    type TagLike = {
      tag: string
      attrs?: Record<string, string>
      children?: string
      injectTo?: string
    }
    const tags: TagLike[] = Array.isArray(raw)
      ? (raw as TagLike[])
      : ((raw as { tags?: TagLike[] }).tags ?? [])
    expect(tags.length).toBeGreaterThan(0)
    const script = tags.find(
      (t) =>
        t.tag === 'script' &&
        t.attrs?.['type'] === 'module' &&
        /react-perfscope\/auto/.test(t.children ?? '')
    )
    expect(script).toBeTruthy()
    // Must be prepended so it runs before any author scripts that load react-dom
    expect(script?.injectTo).toBe('head-prepend')
  })

  it('accepts options object (currently unused; reserves shape for Phase 6)', () => {
    expect(() => reactPerfscope({})).not.toThrow()
  })
})
