import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Tab } from '@shared/types'
import { useRuntime } from '@/store/runtime'
import { deviceById, paneLabel, paneSize, useWorkspace } from '@/store/workspace'
import { DeviceIcon, PaneCard } from './PaneCard'
import { StartPage } from './StartPage'
import { cx } from './ui'

const HEADER = 30
const PADDING = 22

/** Lays out one tab's device panes and works out the zoom that fits them. */
export function Stage({ tab, active }: { tab: Tab; active: boolean }): ReactNode {
  const settings = useWorkspace((s) => s.settings)
  const customDevices = useWorkspace((s) => s.customDevices)
  const dragging = useRuntime((s) => s.dragging)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 1200, height: 700 })
  const frozenZoom = useRef(1)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setBox({ width, height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const sizes = tab.panes.map((p) => paneSize(p, deviceById(p.deviceId, customDevices)))
  const focusId = tab.panes.some((p) => p.id === tab.focusPaneId) ? tab.focusPaneId! : tab.panes[0]?.id
  const focusIndex = tab.panes.findIndex((p) => p.id === focusId)
  const frame = settings.showFrames ? 26 + 44 : 0
  const sides = tab.compareUrl ? 2 : 1
  const chips = settings.layout === 'focus' ? 40 : 0
  const room = box.height - HEADER - PADDING * 2 - frame - chips - 14

  let zoom: number
  if (typeof settings.zoom === 'number') zoom = settings.zoom
  else if (settings.layout === 'focus' && sizes[focusIndex]) {
    zoom = Math.min(1, room / sizes[focusIndex].height, (box.width - PADDING * 2 - frame) / (sizes[focusIndex].width * sides))
  } else zoom = Math.min(1, room / Math.max(...sizes.map((s) => s.height), 1))
  zoom = Math.max(0.15, Math.round(zoom * 1000) / 1000)
  // Resizing a pane changes the fit; holding the zoom keeps the handle under the cursor.
  if (dragging) zoom = frozenZoom.current
  else frozenZoom.current = zoom

  useEffect(() => {
    if (active) useRuntime.getState().set({ effectiveZoom: zoom })
  }, [active, zoom])

  const onWheel = (e: React.WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return
    const next = Math.min(1.5, Math.max(0.15, zoom * (1 - e.deltaY * 0.01)))
    useWorkspace.getState().setSettings({ zoom: Math.round(next * 100) / 100 })
  }

  return (
    <div className={cx('stage', `bg-${settings.stageBg}`, !active && 'inactive')} ref={ref} onWheel={onWheel} aria-hidden={!active}>
      {settings.layout === 'focus' ? (
        <div className="focus-chips">
          {tab.panes.map((p) => {
            const device = deviceById(p.deviceId, customDevices)
            return (
              <button key={p.id} type="button" className={cx('chip', p.id === focusId && 'on')} onClick={() => useWorkspace.getState().updateTab(tab.id, { focusPaneId: p.id })}>
                <DeviceIcon kind={device.kind} size={12} />
                {paneLabel(p, device)}
              </button>
            )
          })}
        </div>
      ) : null}
      <div className={cx('stage-scroll', `layout-${settings.layout}`)}>
        <div className="stage-inner">
          {tab.panes.map((pane, index) => (
            <PaneCard key={pane.id} tab={tab} pane={pane} index={index} zoom={zoom} hidden={settings.layout === 'focus' && pane.id !== focusId} />
          ))}
        </div>
      </div>
      {!tab.url && active ? <StartPage tabId={tab.id} /> : null}
    </div>
  )
}
