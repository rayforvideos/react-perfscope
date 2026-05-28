# @react-perfscope/webpack

> [English README](./README.md)

development 모드에서 `react-perfscope/auto`를 추가 엔트리로 넣어주는 Webpack 플러그인.

## 설치

```sh
npm install -D @react-perfscope/webpack react-perfscope
```

## 사용법

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

플러그인은 `compiler.options.mode`를 확인해서 `'development'` 외에는 no-op으로 동작한다.
