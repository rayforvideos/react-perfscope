import type { Compiler } from 'webpack'

export interface ReactPerfscopePluginOptions {
  // Reserved for Phase 6.
}

/**
 * Webpack plugin that adds `react-perfscope/auto` as an additional entry in
 * development mode. The auto module bootstraps recorder + render collector
 * + UI mount at runtime.
 */
export class ReactPerfscopePlugin {
  constructor(_opts?: ReactPerfscopePluginOptions) {
    void _opts
  }

  apply(compiler: Compiler): void {
    if (compiler.options.mode !== 'development') return
    const EntryPlugin = compiler.webpack.EntryPlugin
    // EntryPlugin's options arg can be `string | EntryOptions`. Passing an
    // empty EntryOptions makes this an additional "global" entry (loaded
    // alongside the named entries). Webpack 5's typing accepts {} here.
    new EntryPlugin(
      compiler.context,
      'react-perfscope/auto',
      {} as ConstructorParameters<typeof EntryPlugin>[2]
    ).apply(compiler)
  }
}

export default ReactPerfscopePlugin
