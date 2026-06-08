import { test, expect } from '@playwright/test'
import { openFixtures } from './_helpers'

// The strongest trust claim: an idle app produces no phantom noise floor.
// Only genuine web vitals may appear; every synthetic signal kind must be
// empty for a recording where nothing happens.
test('idle recording emits no synthetic signals', async ({ page }) => {
  await openFixtures(page)
  const result = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    t.groundTruth.reset()
    t.start()
    await t.scenarios.idle(2500)
    return t.stop()
  })

  const synthetic = result.signals.filter((s) => s.kind !== 'web-vital')
  const kinds = synthetic.map((s) => s.kind)
  expect(kinds, `unexpected synthetic signals: ${JSON.stringify(kinds)}`).toEqual([])
})
