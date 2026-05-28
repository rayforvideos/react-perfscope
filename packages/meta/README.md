# react-perfscope

Performance debugging tool for React 18+ apps. Records forced reflows, layout shifts, long tasks, paint, web vitals, network, and React component renders during development.

This meta package re-exports everything from `@react-perfscope/core`, `@react-perfscope/react`, and `@react-perfscope/ui`, plus a side-effect `react-perfscope/auto` entry that bootstraps the full UI in one import.

## Quickstart

The simplest way to enable react-perfscope in a dev build:

```ts
// At the top of your entry file (e.g. src/main.tsx)
import 'react-perfscope/auto'

// ... your normal imports
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`react-perfscope/auto` must be imported BEFORE `react-dom` so the DevTools hook is installed before React captures it. Build plugins (`@react-perfscope/vite`, `@react-perfscope/webpack`) handle this ordering automatically.

## Manual API

If you want to control mounting yourself, import the named exports:

```ts
import { createRecorder, createRenderCollector, mount } from 'react-perfscope'

const recorder = createRecorder()
recorder.use(createRenderCollector())
const unmount = mount({ recorder, position: 'top-right' })
```

## Production safety

`react-perfscope/auto` bails when `process.env.NODE_ENV === 'production'`. The build plugins also exclude themselves from production builds. The manual API has no production guard — use it only behind your own dev/prod check.
