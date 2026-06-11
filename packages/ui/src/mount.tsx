import { h } from 'preact'
import { App } from './app'
import { mountShadow } from './shadow-mount'
import type { MountOptions, UnmountFn } from './types'

export function mount(opts: MountOptions): UnmountFn {
  const { recorder, position = 'bottom-right', host = document.body, resolveFrame, finalize } = opts
  // Guard against double-bootstrap (e.g. the /auto entry evaluated twice via
  // a dev-server full reload plus a manual mount) — stacked widgets each run
  // their own timers and confuse the recording state.
  if (host.querySelector('[data-perfscope-host]')) {
    console.warn('[react-perfscope] mount(): a widget is already mounted here — ignoring this call')
    return () => {}
  }
  return mountShadow(
    <App recorder={recorder} position={position} resolveFrame={resolveFrame} finalize={finalize} />,
    { parent: host }
  )
}
