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
      // Inline-import form goes through Vite's standard import-analysis
      // pipeline (documented public API). head-prepend ensures the bootstrap
      // executes before any author scripts that pull in react-dom — required
      // because react-dom captures __REACT_DEVTOOLS_GLOBAL_HOOK__ at module
      // evaluation time.
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import 'react-perfscope/auto'`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
