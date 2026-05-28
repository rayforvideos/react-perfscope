import type { Plugin, HtmlTagDescriptor } from 'vite'

export interface ReactPerfscopePluginOptions {
  // Reserved for Phase 6 (position, host, disabled, etc.).
}

/**
 * Vite plugin that auto-injects `react-perfscope/auto` into the HTML entry
 * during dev mode. The injected script imports the meta package which
 * bootstraps a recorder + render collector + UI mount.
 */
export default function reactPerfscope(_opts?: ReactPerfscopePluginOptions): Plugin {
  return {
    name: 'react-perfscope',
    apply: 'serve',
    transformIndexHtml(_html: string): HtmlTagDescriptor[] {
      return [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: '/@id/react-perfscope/auto',
          },
          injectTo: 'head',
        },
      ]
    },
  }
}
