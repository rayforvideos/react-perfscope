import type { Page } from '@playwright/test'
import '../harness-types'

export const FIXTURES_URL = 'http://localhost:5188/'
export const EXAMPLE_URL = 'http://localhost:5189/'

export async function openFixtures(page: Page): Promise<void> {
  await page.goto(FIXTURES_URL)
  await page.waitForFunction(() => window.__perfscopeReady === true)
  // Let cold-start work (dev-server dep optimization, first paint, module
  // eval) drain before any recording. The "idle is silent" claim is about
  // steady state, not boot — recording during warmup would catch a one-off
  // long task and flake.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

/** Absolute tolerance floor combined with a relative tolerance — timing
 * measurements jitter, so we assert "close enough" rather than exact. */
export function closeEnough(
  actual: number,
  expected: number,
  absMs = 2,
  rel = 0.15,
): boolean {
  return Math.abs(actual - expected) <= Math.max(absMs, expected * rel)
}
