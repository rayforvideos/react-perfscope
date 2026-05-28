import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/auto.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@react-perfscope/core', '@react-perfscope/react', '@react-perfscope/ui'],
})
