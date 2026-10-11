import { bridge } from '@/lib/bridge'

/*
 * Chromium's mouse-to-touch emulator belongs to the whole window, not to one
 * guest. While it is on, the host UI stops receiving mouse moves, so it cannot
 * notice the pointer leaving a pane. The cursor is polled from the main
 * process instead and the emulator is switched off the moment it leaves.
 */

let engaged: { viewId: string; timer: number } | null = null

export function releaseTouch(): void {
  if (!engaged) return
  clearInterval(engaged.timer)
  void bridge.touchEmit(engaged.viewId, false)
  engaged = null
}

export function engageTouch(viewId: string, el: HTMLElement): void {
  if (engaged?.viewId === viewId) return
  releaseTouch()
  void bridge.touchEmit(viewId, true)
  const timer = window.setInterval(async () => {
    const point = await bridge.cursor()
    if (!engaged || engaged.viewId !== viewId) return
    const r = el.getBoundingClientRect()
    const inside = !!point && el.isConnected && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom
    if (!inside) releaseTouch()
  }, 80)
  engaged = { viewId, timer }
}
