# @react-perfscope/webpack

Webpack plugin that adds `react-perfscope/auto` as an additional entry in development mode.

## Install

```sh
npm install -D @react-perfscope/webpack react-perfscope
```

## Usage

```js
// webpack.config.js
const { ReactPerfscopePlugin } = require('@react-perfscope/webpack')

module.exports = {
  mode: 'development',
  plugins: [
    new ReactPerfscopePlugin(),
  ],
}
```

The plugin checks `compiler.options.mode` and is a no-op when mode is anything other than `'development'`.
