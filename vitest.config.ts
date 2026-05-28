import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['packages/*/tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@react-perfscope/core': resolve(here, 'packages/core/src/index.ts'),
    },
  },
})
