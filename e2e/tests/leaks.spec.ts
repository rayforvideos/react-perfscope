import { test, expect } from '@playwright/test'
import { openFixtures } from './_helpers'

// Mounts and unmounts a deliberately-leaking component repeatedly (an uncleared
// interval keeps each instance's fiber retained). The collector should flag it
// as a suspect with a climbing retained count. Runs in real Chromium so GC
// behavior is real.
test('detects a leaking component by name', async ({ page }) => {
  await openFixtures(page)
  const result = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    t.start()
    await t.scenarios.leak(16)
    return t.stop()
  })

  const suspects = result.leakSuspects ?? []
  const leaky = suspects.find((s) => s.component === 'Leaky')
  expect(leaky, `expected 'Leaky' among suspects: ${JSON.stringify(suspects)}`).toBeTruthy()
  expect(leaky!.retained).toBeGreaterThan(0)
})
