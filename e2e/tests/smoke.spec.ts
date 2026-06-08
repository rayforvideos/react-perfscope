import { test, expect } from '@playwright/test'
import { EXAMPLE_URL } from './_helpers'

// End-to-end smoke of the real injection path: the example app pulls in
// react-perfscope via the Vite plugin (no manual wiring), the widget mounts,
// and a real recording driven through the UI surfaces signals in the panel.
// The fixtures harness bypasses this path to read internals — this test is the
// one that proves the plugin + /auto bootstrap + UI actually work together.
test('example app: plugin injects the widget and records via the UI', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(EXAMPLE_URL)

  // The floating rec widget is injected by the plugin — its presence proves
  // /auto bootstrapped.
  const recButton = page.getByRole('button', { name: 'Start recording' })
  await expect(recButton).toBeVisible({ timeout: 10_000 })

  await recButton.click()

  // Drive the example app's own demo controls to generate signals.
  await page.getByRole('button', { name: /Trigger 30 forced reflows/ }).click()
  await page.getByRole('button', { name: /^count:/ }).click()
  await page.getByRole('button', { name: /Insert tall block/ }).click()
  await page.waitForTimeout(200)

  await page.getByRole('button', { name: 'Stop recording' }).click()

  // The panel opens and shows a tab per captured signal kind. Tabs only render
  // for kinds actually present, so a forced-reflow tab proves end-to-end capture.
  await expect(page.locator('[data-kind="forced-reflow"]')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('[data-kind="render"]')).toBeVisible()

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})
