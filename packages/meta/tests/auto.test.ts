import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

const mount = vi.fn()
vi.mock('@react-perfscope/ui', () => ({ mount: (...args: unknown[]) => mount(...args) }))
vi.mock('@react-perfscope/react', () => ({ installDevToolsHook: vi.fn(() => () => {}) }))
vi.mock('@react-perfscope/core', () => ({
  createSourceMapResolver: vi.fn(() => ({ resolve: vi.fn() })),
}))
vi.mock('../src/bootstrap', () => ({
  createConfiguredRecorder: vi.fn(() => ({ recorder: {}, finalize: vi.fn() })),
}))

type MountedGlobal = { __REACT_PERFSCOPE_AUTO_MOUNTED__?: boolean }

describe('auto bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    mount.mockClear()
    delete (globalThis as MountedGlobal).__REACT_PERFSCOPE_AUTO_MOUNTED__
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('bails when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await import('../src/auto')
    expect(mount).not.toHaveBeenCalled()
    expect((globalThis as MountedGlobal).__REACT_PERFSCOPE_AUTO_MOUNTED__).toBeUndefined()
  })

  it('mounts once in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await import('../src/auto')
    expect(mount).toHaveBeenCalledTimes(1)
    expect((globalThis as MountedGlobal).__REACT_PERFSCOPE_AUTO_MOUNTED__).toBe(true)
  })

  it('reads NODE_ENV via a statically-replaceable expression', () => {
    // Bundlers (Vite define, webpack DefinePlugin, esbuild) replace the exact
    // member expression `process.env.NODE_ENV`. Optional-chained access via a
    // globalThis cast is NOT replaced, and browsers have no `process` global,
    // so such a guard silently never fires in production bundles.
    const src = readFileSync(resolve(here, '../src/auto.ts'), 'utf8')
    expect(src).not.toContain('process?.env')
    expect(src).not.toContain('globalThis as { process')
    expect(src).toMatch(/\bprocess\.env\.NODE_ENV\b/)
  })
})
