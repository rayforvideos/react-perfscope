import { defineConfig } from 'vite'

// Deterministic fixtures app for the E2E verification harness. No
// @vitejs/plugin-react: we control React import order by hand (the DevTools
// hook must be installed before react-dom evaluates), and Fast Refresh would
// only add nondeterminism. esbuild handles the JSX transform.
export default defineConfig({
  root: __dirname,
  esbuild: { jsx: 'automatic' },
  server: {
    // JS Self-Profiling (long-task hot-function attribution) only initializes
    // when the document carries this header — mirror what the Vite plugin sets.
    headers: { 'Document-Policy': 'js-profiling' },
  },
})
