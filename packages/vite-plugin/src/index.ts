import type { Plugin, HtmlTagDescriptor } from 'vite'

export interface ReactPerfscopePluginOptions {
  // Reserved for Phase 6 (position, host, disabled, etc.).
}

const VIRTUAL_ID = '\0virtual:react-perfscope-bootstrap'
const VIRTUAL_URL = '/@react-perfscope-bootstrap.js'

/**
 * Vite plugin that auto-injects `react-perfscope/auto` into the HTML entry
 * during dev mode. The injected script imports the meta package which
 * bootstraps a recorder + render collector + UI mount.
 *
 * Implementation: Vite does NOT transform inline `<script type="module">`
 * content, so writing `import 'react-perfscope/auto'` directly into a tag
 * fails (the browser can't resolve bare specifiers). Instead we expose a
 * virtual module via `resolveId`/`load` and inject a `<script src>` that
 * points at it — Vite's module-loading pipeline transforms the module body
 * (where the bare specifier IS resolved) before delivering it.
 */
export default function reactPerfscope(_opts?: ReactPerfscopePluginOptions): Plugin {
  return {
    name: 'react-perfscope',
    apply: 'serve',
    config(config) {
      // Force-bundle the perfscope packages as deps so @vitejs/plugin-react
      // (and similar transforms) see them as node_modules — otherwise the
      // workspace-linked dist files get pulled through Fast Refresh, which
      // throws "can't detect preamble" because our bootstrap runs before
      // the React plugin's preamble.
      config.optimizeDeps ??= {}
      config.optimizeDeps.include ??= []
      const toInclude = [
        'react-perfscope/auto',
        '@react-perfscope/core',
        '@react-perfscope/react',
        '@react-perfscope/ui',
      ]
      for (const dep of toInclude) {
        if (!config.optimizeDeps.include.includes(dep)) {
          config.optimizeDeps.include.push(dep)
        }
      }
      return config
    },
    resolveId(id) {
      if (id === VIRTUAL_URL) return VIRTUAL_ID
      return null
    },
    load(id) {
      if (id === VIRTUAL_ID) {
        return `import 'react-perfscope/auto'`
      }
      return null
    },
    transformIndexHtml(_html: string): HtmlTagDescriptor[] {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: VIRTUAL_URL },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
