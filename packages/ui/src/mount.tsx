import { h } from 'preact'
import { App } from './app'
import { mountShadow } from './shadow-mount'
import type { MountOptions, UnmountFn } from './types'

export function mount(opts: MountOptions): UnmountFn {
  const { recorder, position = 'bottom-right', host = document.body, resolveFrame } = opts
  return mountShadow(
    <App recorder={recorder} position={position} resolveFrame={resolveFrame} />,
    { parent: host }
  )
}
