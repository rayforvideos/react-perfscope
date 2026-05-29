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
    ensureJsProfilingHeader(compiler)
  }
}

/**
 * The JS Self-Profiling API (used to attribute long tasks to the developer's
 * own functions) only initializes when the document is served with a
 * `Document-Policy: js-profiling` response header. webpack-dev-server reads
 * `compiler.options.devServer` when no options are passed to it explicitly
 * (the `webpack serve` CLI path), so we merge the header in here. It's a no-op
 * where the browser lacks the API, and we never overwrite a user-set value.
 *
 * webpack-dev-server's `headers` can be an object map or an array of
 * `{ key, value }` entries — handle both shapes.
 */
function ensureJsProfilingHeader(compiler: Compiler): void {
  const KEY = 'Document-Policy'
  const VALUE = 'js-profiling'
  // `devServer` is contributed by webpack-dev-server's type augmentation and
  // isn't part of webpack's core Configuration; treat it loosely.
  const options = compiler.options as unknown as {
    devServer?: {
      headers?: Record<string, string> | Array<{ key: string; value: string }>
    }
  }
  const devServer = (options.devServer ??= {})
  if (devServer.headers === undefined) {
    devServer.headers = { [KEY]: VALUE }
    return
  }
  if (Array.isArray(devServer.headers)) {
    if (!devServer.headers.some((h) => h.key === KEY)) {
      devServer.headers.push({ key: KEY, value: VALUE })
    }
    return
  }
  if (!(KEY in devServer.headers)) {
    devServer.headers[KEY] = VALUE
  }
}

export default ReactPerfscopePlugin
