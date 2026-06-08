import { test, expect } from '@playwright/test'
import type { ForcedReflowSignal, LongTaskSignal, LayoutShiftSignal, NetworkSignal, RenderSignal } from '@react-perfscope/core'
import { openFixtures, closeEnough } from './_helpers'

// Each test drives one scenario, then compares what react-perfscope recorded
// against the browser's own measurement of the same event. perfscope reads
// these native APIs, so the numbers must line up.

test('long-task duration matches the native entry', async ({ page }) => {
  await openFixtures(page)
  const r = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    t.groundTruth.reset()
    t.start()
    t.scenarios.longTask(140)
    // Let the long-task / LoAF observer deliver its entry.
    await t.settle(150)
    const result = await t.stop()
    return { result, gt: t.groundTruth.get() }
  })

  const longTasks = r.result.signals.filter((s): s is LongTaskSignal => s.kind === 'long-task')
  expect(longTasks.length, 'expected at least one long-task signal').toBeGreaterThan(0)

  const perfMax = Math.max(...longTasks.map((s) => s.duration))
  const nativeMax = Math.max(...r.gt.longTasks)
  expect(perfMax).toBeGreaterThanOrEqual(50)
  expect(
    closeEnough(perfMax, nativeMax, 5, 0.2),
    `perfscope long-task ${perfMax}ms vs native ${nativeMax}ms`,
  ).toBe(true)
})

test('layout-shift values match the native entries', async ({ page }) => {
  await openFixtures(page)
  const r = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    t.groundTruth.reset()
    t.start()
    await t.scenarios.layoutShift()
    await t.settle(100)
    const result = await t.stop()
    return { result, gt: t.groundTruth.get() }
  })

  const shifts = r.result.signals.filter((s): s is LayoutShiftSignal => s.kind === 'layout-shift')
  expect(shifts.length, 'expected a layout-shift signal').toBeGreaterThan(0)

  const perfSum = shifts.reduce((a, s) => a + s.value, 0)
  const nativeSum = r.gt.layoutShifts.reduce((a, v) => a + v, 0)
  expect(nativeSum).toBeGreaterThan(0)
  expect(
    closeEnough(perfSum, nativeSum, 0.001, 0.05),
    `perfscope CLS-sum ${perfSum} vs native ${nativeSum}`,
  ).toBe(true)
})

test('commit render duration matches React Profiler and coalesces', async ({ page }) => {
  await openFixtures(page)
  const N = 200
  const r = await page.evaluate(async (n) => {
    const t = window.__perfscopeTest!
    t.groundTruth.reset()
    t.start()
    await t.scenarios.renderMany(n)
    await t.settle(50)
    const result = await t.stop()
    return { result, commits: t.groundTruth.commitDurations() }
  }, N)

  const renders = r.result.signals.filter((s): s is RenderSignal => s.kind === 'render')
  // One coalesced commit signal (carrying members), not one-per-fiber.
  const commitSignals = renders.filter((s) => Array.isArray(s.members))
  expect(commitSignals.length, 'expected exactly one coalesced commit signal').toBe(1)

  const commit = commitSignals[0]!
  // The commit re-rendered the N leaves (plus a wrapper or two).
  expect(commit.count ?? 0).toBeGreaterThanOrEqual(N)

  // perfscope's commit duration should match React's own actualDuration for
  // the largest commit the Profiler saw.
  const nativeMax = Math.max(...r.commits)
  expect(
    closeEnough(commit.duration, nativeMax, 1, 0.25),
    `perfscope commit ${commit.duration}ms vs Profiler ${nativeMax}ms`,
  ).toBe(true)
})

test('forced reflow is one coalesced signal with a captured stack', async ({ page }) => {
  await openFixtures(page)
  const ITER = 60
  const result = await page.evaluate(async (iter) => {
    const t = window.__perfscopeTest!
    t.start()
    t.scenarios.forcedReflow(iter)
    return t.stop()
  }, ITER)

  const reflows = result.signals.filter((s): s is ForcedReflowSignal => s.kind === 'forced-reflow')
  // All reads in one synchronous turn coalesce into a single signal.
  expect(reflows.length, 'expected exactly one coalesced forced-reflow signal').toBe(1)
  const reflow = reflows[0]!
  expect(reflow.count ?? 1, 'coalesced read count').toBe(ITER)
  expect(reflow.stack.length, 'a call stack was captured').toBeGreaterThan(0)
  // The stack should trace back to the fixtures scenario module.
  expect(reflow.stack.some((f) => /scenarios/.test(f.file))).toBe(true)
})

test('network signals count the app fetches', async ({ page }) => {
  await openFixtures(page)
  const COUNT = 5
  const result = await page.evaluate(async (count) => {
    const t = window.__perfscopeTest!
    t.start()
    await t.scenarios.network(count)
    await t.settle(100)
    return t.stop()
  }, COUNT)

  const net = result.signals.filter((s): s is NetworkSignal => s.kind === 'network')
  const probes = net.filter((s) => s.url.includes('probe='))
  expect(probes.length, `expected ${COUNT} probe fetches`).toBe(COUNT)
  // Note: the tool's own source-map fetches can't leak here because the
  // harness mounts no source-map resolver, so there's nothing meaningful to
  // assert about self-request exclusion at this layer — it's unit-tested in
  // @react-perfscope/core (self-requests).
})
