import { test } from '@playwright/test'
import { openFixtures } from './_helpers'

// Non-gating: reproduces the measurement-overhead numbers quoted in the README
// (recording ON vs OFF). Skipped by default — run with PERFSCOPE_REPORT=1.
// It prints a table rather than asserting, because absolute timings vary by
// machine and would flake as a gate.
test('overhead report: recording ON vs OFF', async ({ page }) => {
  test.skip(!process.env.PERFSCOPE_REPORT, 'set PERFSCOPE_REPORT=1 to run')

  await openFixtures(page)

  const report = await page.evaluate(async () => {
    const t = window.__perfscopeTest!
    const median = (xs: number[]): number => {
      const s = [...xs].sort((a, b) => a - b)
      return s[Math.floor(s.length / 2)]!
    }

    async function timeReflow(record: boolean, reads: number): Promise<number> {
      if (record) t.start()
      const t0 = performance.now()
      t.scenarios.forcedReflow(reads)
      const dt = performance.now() - t0
      if (record) await t.stop()
      await new Promise((r) => setTimeout(r, 0))
      return dt
    }

    const READS = 5000
    const RUNS = 7
    const off: number[] = []
    const on: number[] = []
    for (let i = 0; i < RUNS; i++) off.push(await timeReflow(false, READS))
    for (let i = 0; i < RUNS; i++) on.push(await timeReflow(true, READS))

    const offMed = median(off)
    const onMed = median(on)
    return {
      reads: READS,
      offMs: offMed,
      onMs: onMed,
      deltaMs: onMed - offMed,
      perReadUs: ((onMed - offMed) / READS) * 1000,
    }
  })

  console.log('\n=== react-perfscope overhead (forced-reflow thrash) ===')
  console.log(`reads/turn:      ${report.reads}`)
  console.log(`recording OFF:   ${report.offMs.toFixed(2)} ms`)
  console.log(`recording ON:    ${report.onMs.toFixed(2)} ms`)
  console.log(`added:           ${report.deltaMs.toFixed(2)} ms`)
  console.log(`per read:        ${report.perReadUs.toFixed(2)} µs`)
  console.log('========================================================\n')
})
