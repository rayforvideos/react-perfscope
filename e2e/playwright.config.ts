import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// Two dev servers: the deterministic fixtures app (harness core) and the real
// example app (smoke test of the /auto + Vite-plugin injection path).
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: { trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'vite --config fixtures/vite.config.ts --port 5188 --strictPort',
      url: 'http://localhost:5188',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'vite --port 5189 --strictPort',
      cwd: '../examples/vite-react',
      url: 'http://localhost:5189',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
