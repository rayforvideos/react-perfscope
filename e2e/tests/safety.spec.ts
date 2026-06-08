import { test, expect } from '@playwright/test'
import { openFixtures } from './_helpers'

// The tool runs in-band on the host's main thread. These guard the promises
// that make it production-safe: it never throws into the app, it stays bounded
// under pathological load, and it goes fully silent when not recording.

// Coalescing collapses thrash loops and large commits into one signal each, so
// even pathological scenarios produce only a handful of signals — orders of
// magnitude below the recorder's BUFFER_CAP (10k). If a scenario ever exceeds
// this, coalescing regressed and the buffer is no longer protected.
const COALESCED_CEILING = 100

test('pathological load throws nothing and stays coalesced and bounded', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await openFixtures(page)
  const r = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    t.start()
    t.scenarios.forcedReflow(5000) // 5k layout reads in one turn
    await t.scenarios.renderMany(800) // 800-component commit
    await t.scenarios.network(20)
    t.scenarios.longTask(80)
    await t.settle(150)
    const result = await t.stop()
    return { count: result.signals.length, bufferCap: t.bufferCap, signals: result.signals }
  })

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])

  // 5,000 reads coalesce to ONE forced-reflow signal; 800 fibers to ONE commit
  // signal. The flooding protection keeps the buffer tiny, far under the cap.
  const reflows = r.signals.filter((s) => s.kind === 'forced-reflow')
  const commits = r.signals.filter((s) => s.kind === 'render' && 'members' in s)
  expect(reflows.length, 'forced reflows coalesced').toBe(1)
  expect(commits.length, 'render commit coalesced').toBe(1)
  expect(r.count).toBeLessThan(r.bufferCap)
  expect(r.count, 'buffer stayed small despite heavy load').toBeLessThan(COALESCED_CEILING)
})

test('activity outside a recording window is not captured', async ({ page }) => {
  await openFixtures(page)
  const result = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    // Generate work while NOT recording — collectors must be deactivated.
    t.scenarios.forcedReflow(100)
    t.scenarios.longTask(80)
    await t.scenarios.layoutShift()
    await t.settle(100)
    // Now record an idle window.
    t.start()
    await t.scenarios.idle(500)
    return t.stop()
  })

  const synthetic = result.signals.filter((s) => s.kind !== 'web-vital')
  expect(
    synthetic.map((s) => s.kind),
    'pre-recording activity leaked into the recording',
  ).toEqual([])
})

test('repeated start/stop cycles stay stable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await openFixtures(page)
  const counts = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    const out: number[] = []
    for (let i = 0; i < 5; i++) {
      t.start()
      t.scenarios.forcedReflow(50)
      await t.scenarios.renderMany(20 + i)
      await t.settle(30)
      out.push((await t.stop()).signals.length)
    }
    return out
  })

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
  // Each cycle is independent — counts don't grow run over run (no leak/accrual).
  expect(Math.max(...counts)).toBeLessThan(COALESCED_CEILING)
})
