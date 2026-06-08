import { store } from './app'

const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r()))

let reflowTarget: HTMLDivElement | undefined
function getReflowTarget(): HTMLDivElement {
  if (!reflowTarget) {
    reflowTarget = document.createElement('div')
    reflowTarget.id = 'reflow-target'
    reflowTarget.style.cssText = 'width:100px;height:20px;background:#fc0'
    document.body.appendChild(reflowTarget)
  }
  return reflowTarget
}

// Created and painted eagerly so the paragraph has a stable previous position
// — a layout shift is only recorded for elements that moved from a position
// they already occupied in an earlier frame.
const shiftContainer = document.createElement('div')
shiftContainer.id = 'shift-container'
const mover = document.createElement('p')
mover.id = 'mover'
mover.textContent = 'this paragraph moves'
shiftContainer.appendChild(mover)
document.body.appendChild(shiftContainer)

export const scenarios = {
  // A classic layout-thrash loop: write a style, then synchronously read a
  // layout property. Each read forces a reflow; all reads in this one
  // synchronous turn coalesce into a single forced-reflow signal.
  forcedReflow(iterations: number): void {
    const el = getReflowTarget()
    for (let i = 0; i < iterations; i++) {
      el.style.width = `${100 + (i % 10)}px`
      void el.offsetWidth
    }
  },

  // Insert a tall block above text so the text shifts down on the next frame.
  async layoutShift(): Promise<void> {
    // Ensure the paragraph's current position is painted first.
    await nextFrame()
    const block = document.createElement('div')
    block.style.cssText = 'height:160px;background:#cbd5e1'
    shiftContainer.insertBefore(block, shiftContainer.firstChild)
    await nextFrame()
    await nextFrame()
  },

  // Block the main thread synchronously for ~ms milliseconds.
  longTask(ms: number): void {
    const target = performance.now() + ms
    let acc = 0
    while (performance.now() < target) acc += Math.sqrt(Math.random() * 1000)
    if (acc < 0) console.log(acc)
  },

  // Fire `count` distinct same-origin fetches.
  async network(count: number): Promise<void> {
    const reqs: Promise<unknown>[] = []
    for (let i = 0; i < count; i++) {
      reqs.push(fetch(`/?probe=${i}-${performance.now()}`).then((r) => r.text()).catch(() => {}))
    }
    await Promise.all(reqs)
    await nextFrame()
  },

  // One commit that re-renders `count` Leaf components.
  async renderMany(count: number): Promise<void> {
    store.setState({ many: count, tick: store.getState().tick + 1 })
    await nextFrame()
  },

  async idle(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
  },

  // Mount then unmount a deliberately-leaking <Leaky> component `rounds` times,
  // spaced so the leak sampler captures the climbing retained count. Each round
  // uses a fresh key so a new instance mounts and the previous one unmounts
  // (and leaks).
  async leak(rounds: number): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      store.setState({ leakOn: true, leakKey: i })
      await nextFrame()
      store.setState({ leakOn: false })
      await new Promise((r) => setTimeout(r, 250))
    }
  },
}

export type Scenarios = typeof scenarios
