import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Code2,
  Copy,
  Diff,
  Ellipsis,
  Image as ImageIcon,
  Laptop,
  Link2Off,
  Monitor,
  Moon,
  MoveHorizontal,
  RotateCcwSquare,
  Scaling,
  ScrollText,
  Shield,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  Watch,
  X
} from 'lucide-react'
import { memo, useMemo, useState, type ReactNode } from 'react'
import type { Device, Pane, Tab } from '@shared/types'
import { captureTab } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import { diffPane } from '@/lib/diff'
import { viewIdOf } from '@/lib/views'
import { toast, useRuntime, useView } from '@/store/runtime'
import { allDevices, deviceById, effectiveEmulation, paneSize, partitionFor, resolveSpec, uid, useWorkspace } from '@/store/workspace'
import { IconButton, MenuItem, Popover, cx } from './ui'
import { WebView } from './WebView'

const KIND_ICON = { phone: Smartphone, foldable: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor, watch: Watch, responsive: Scaling }

export const DeviceIcon = ({ kind, size = 13 }: { kind: Device['kind']; size?: number }): ReactNode => {
  const Icon = KIND_ICON[kind]
  return <Icon size={size} />
}

const ms = (value?: number): string => (value === undefined ? '–' : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`)
const clamp = (value: number, min: number, max: number): number => Math.round(Math.min(max, Math.max(min, value)))

function DevicePicker({ current, onPick }: { current: string; onPick: (id: string) => void }): ReactNode {
  const [query, setQuery] = useState('')
  const custom = useWorkspace((s) => s.customDevices)
  const devices = allDevices(custom).filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.brand.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="device-picker">
      <input autoFocus className="input" placeholder="Switch device…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="device-picker-list">
        {devices.map((d) => (
          <button key={d.id} type="button" className={cx('menu-item', d.id === current && 'checked')} onClick={() => onPick(d.id)}>
            <span className="menu-icon">
              <DeviceIcon kind={d.kind} />
            </span>
            <span className="menu-label">{d.name}</span>
            <span className="menu-hint">
              {d.width}×{d.height}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface Props {
  tab: Tab
  pane: Pane
  index: number
  zoom: number
  hidden?: boolean
}

export const PaneCard = memo(function PaneCard({ tab, pane, index, zoom, hidden }: Props): ReactNode {
  const ws = useWorkspace.getState()
  const customDevices = useWorkspace((s) => s.customDevices)
  const showFrames = useWorkspace((s) => s.settings.showFrames)
  const chrome = useWorkspace((s) => s.info?.chrome ?? '140')
  const design = useRuntime((s) => s.designOverlays[pane.id])
  const diff = useRuntime((s) => s.diffs[pane.id])
  const isActive = useRuntime((s) => s.activeViewId === pane.id || s.activeViewId === viewIdOf(pane.id, 'b'))
  const view = useView(pane.id)

  const device = deviceById(pane.deviceId, customDevices)
  const { width, height } = paneSize(pane, device)
  const spec = useMemo(() => resolveSpec(tab, pane, device, chrome), [tab, pane, device, chrome])
  const emulation = effectiveEmulation(tab, pane)
  const responsive = device.kind === 'responsive'
  const compare = !!tab.compareUrl
  const framed = showFrames && !compare && (device.kind === 'phone' || device.kind === 'tablet' || device.kind === 'foldable' || device.kind === 'watch')
  const radius = framed ? (device.radius ?? 0) * zoom : 0
  const bezel = framed ? Math.max(5, 11 * zoom) : 0
  // In a browser the status bar sits outside the page, so the frame gives the
  // notch its own strip. Only a full-screen web app runs underneath it.
  const hasCutout = !!device.cutout && device.cutout !== 'none'
  const strip = framed && hasCutout && !emulation.standalone ? (device.safeArea?.top ?? 0) * zoom : 0
  const landscape = pane.rotated

  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [picker, setPicker] = useState<HTMLElement | null>(null)

  const update = (patch: Partial<Pane>): void => ws.updatePane(tab.id, pane.id, patch)

  const rotate = (): void => {
    if (responsive) update({ width: height, height: width })
    else update({ rotated: !pane.rotated })
  }

  const cycleScheme = (): void => {
    const next = emulation.colorScheme === 'dark' ? 'light' : 'dark'
    ws.setPaneOverride(tab.id, pane.id, { colorScheme: next })
  }

  const startResize = (e: React.PointerEvent, axis: 'x' | 'y' | 'xy'): void => {
    e.preventDefault()
    const origin = { x: e.clientX, y: e.clientY, width, height }
    // Guests swallow pointer events; park them while a handle is being dragged.
    document.body.classList.add('dragging')
    useRuntime.getState().set({ dragging: true })
    const move = (ev: PointerEvent): void => {
      update({
        width: axis === 'y' ? origin.width : clamp(origin.width + (ev.clientX - origin.x) / zoom, 200, 3840),
        height: axis === 'x' ? origin.height : clamp(origin.height + (ev.clientY - origin.y) / zoom, 200, 2400)
      })
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      document.body.classList.remove('dragging')
      useRuntime.getState().set({ dragging: false })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const pickDesign = async (): Promise<void> => {
    const src = await bridge.pickImage()
    if (src) useRuntime.getState().setDesign(pane.id, { src, opacity: 0.5, difference: false })
  }

  const copyShot = async (): Promise<void> => {
    const [shot] = await captureTab(tab.id, { paneId: pane.id, save: false })
    if (!shot) return
    await bridge.copyImage(shot.dataUrl)
    toast('Screenshot copied to clipboard', 'success')
  }

  const duplicate = (): void => {
    const { id: _id, ...rest } = pane
    ws.updateTab(tab.id, { panes: [...tab.panes.slice(0, index + 1), { ...rest, id: uid() }, ...tab.panes.slice(index + 1)] })
  }

  const overridden = !!pane.overrides && Object.keys(pane.overrides).length > 0
  const cardWidth = width * zoom * (compare ? 2 : 1) + (compare ? 8 : 0) + bezel * 2 + (landscape ? strip : 0)
  const compact = cardWidth < 230

  const webview = (side: 'a' | 'b'): ReactNode => (
    <WebView
      tabId={tab.id}
      paneId={pane.id}
      side={side}
      partition={partitionFor(pane)}
      url={side === 'a' ? tab.url : tab.compareUrl!}
      spec={spec}
      width={width}
      height={height}
      zoom={zoom}
      overlays={tab.overlays}
      liveCss={tab.liveCss}
      isPrimary={index === 0}
    />
  )

  // Side A keeps the same place in the tree whether or not a comparison is
  // open, so starting one does not remount (and reload) the page.
  const views = (
    <>
      <div className="side-slot" key="a">
        {webview('a')}
        {compare ? <span className="side-tag">A</span> : null}
      </div>
      {compare ? (
        <div className="side-slot" key="b">
          {webview('b')}
          <span className="side-tag">{diff ? `B · ${diff.percent < 0.01 ? 'identical' : `${diff.percent.toFixed(diff.percent < 1 ? 2 : 1)}% differs`}` : 'B'}</span>
          {diff ? <img className="diff-overlay" src={diff.dataUrl} alt="Pixel difference between A and B" title="Magenta marks pixels that differ. Click to dismiss." onClick={() => useRuntime.getState().setDiff(pane.id, null)} /> : null}
        </div>
      ) : null}
    </>
  )

  return (
    <section className={cx('pane', isActive && 'is-active', hidden && 'is-hidden')} style={{ width: cardWidth }} data-pane={pane.id} aria-label={device.name}>
      <header className="pane-head">
        <button type="button" className="pane-name" title={`${device.name} · ${width}×${height} @${device.dpr}x. Click to switch device`} onClick={(e) => setPicker(e.currentTarget)}>
          <DeviceIcon kind={device.kind} />
          <span>{device.name}</span>
        </button>
        {responsive ? (
          <span className="pane-dims editable">
            <input aria-label="Width" type="number" value={width} min={200} max={3840} onChange={(e) => update({ width: clamp(Number(e.target.value) || 200, 200, 3840) })} />
            ×
            <input aria-label="Height" type="number" value={height} min={200} max={2400} onChange={(e) => update({ height: clamp(Number(e.target.value) || 200, 200, 2400) })} />
          </span>
        ) : compact ? null : (
          <span className="pane-dims">
            {width}×{height}
            <i>@{device.dpr}x</i>
          </span>
        )}
        <span className="pane-badges">
          {view.metrics?.overflowX ? (
            <span className="badge red" title={`Page is ${view.metrics.scrollWidth}px wide in a ${view.metrics.viewportWidth}px viewport.${device.mobile ? ' Phones zoom out to fit, which is why it looks small.' : ''}`}>
              <MoveHorizontal size={11} />
              {compact ? '' : `+${view.metrics.scrollWidth - view.metrics.viewportWidth}px`}
            </span>
          ) : null}
          {view.errors > 0 ? (
            <button type="button" className="badge red" title={`${view.errors} console or network errors`} onClick={() => ws.setSettings({ panelOpen: true, panelTab: 'console' })}>
              {view.errors}
            </button>
          ) : null}
          {!compact && view.vitals.lcp !== undefined ? (
            <span className={cx('badge', view.vitals.lcp > 4000 ? 'red' : view.vitals.lcp > 2500 ? 'amber' : 'dim')} title={`LCP ${ms(view.vitals.lcp)} · FCP ${ms(view.vitals.fcp)} · CLS ${view.vitals.cls?.toFixed(3) ?? '–'} · TTFB ${ms(view.vitals.ttfb)}`}>
              {ms(view.vitals.lcp)}
            </span>
          ) : null}
          {pane.unsynced ? (
            <span className="badge dim" title="Not mirroring interactions">
              <Link2Off size={11} />
            </span>
          ) : null}
          {pane.isolated ? (
            <span className="badge dim" title="Isolated session">
              <Shield size={11} />
            </span>
          ) : null}
        </span>
        <span className="pane-actions">
          <IconButton size="sm" title={`Colour scheme: ${emulation.colorScheme}. Click to override for this device`} active={pane.overrides?.colorScheme !== undefined} onClick={cycleScheme}>
            {emulation.colorScheme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
          </IconButton>
          <IconButton size="sm" title="Rotate" active={pane.rotated} disabled={!device.mobile && !responsive} onClick={rotate}>
            <RotateCcwSquare size={13} />
          </IconButton>
          {compare ? (
            <IconButton size="sm" title="Pixel diff A against B" active={!!diff} onClick={() => (diff ? useRuntime.getState().setDiff(pane.id, null) : void diffPane(pane.id))}>
              <Diff size={13} />
            </IconButton>
          ) : null}
          <IconButton size="sm" title="Screenshot this device" onClick={() => void captureTab(tab.id, { paneId: pane.id })}>
            <Camera size={13} />
          </IconButton>
          <IconButton size="sm" title="More" active={!!menu} onClick={(e) => setMenu(e.currentTarget)}>
            <Ellipsis size={13} />
          </IconButton>
        </span>
      </header>

      <div className={cx('pane-body', framed && 'framed', framed && `kind-${device.kind}`)} style={framed ? { padding: bezel, borderRadius: radius + bezel } : undefined}>
        <div className="pane-screen" style={{ borderRadius: radius, flexDirection: strip ? (landscape ? 'row' : 'column') : undefined, gap: strip ? 0 : undefined }}>
          {strip ? (
            <div className="status-strip" style={landscape ? { width: strip } : { height: strip, fontSize: 15 * zoom, padding: `0 ${30 * zoom}px` }}>
              {landscape ? null : '9:41'}
            </div>
          ) : null}
          {views}
          {design ? (
            <img className="design-overlay" src={design.src} alt="" style={{ opacity: design.opacity, mixBlendMode: design.difference ? 'difference' : 'normal', width: width * zoom }} />
          ) : null}
          {framed && device.cutout && device.cutout !== 'none' ? <div className={cx('cutout', device.cutout, pane.rotated && 'rotated')} style={{ transform: `scale(${zoom})` }} /> : null}
          {framed && (device.os === 'ios' || device.os === 'ipados') && device.cutout !== 'none' ? <div className={cx('home-bar', pane.rotated && 'rotated')} style={{ width: 134 * zoom, height: Math.max(2, 5 * zoom), bottom: 8 * zoom }} /> : null}
        </div>
        {responsive ? (
          <>
            <div className="resize-handle x" onPointerDown={(e) => startResize(e, 'x')} title="Drag to resize" />
            <div className="resize-handle y" onPointerDown={(e) => startResize(e, 'y')} title="Drag to resize" />
            <div className="resize-handle xy" onPointerDown={(e) => startResize(e, 'xy')} title="Drag to resize" />
          </>
        ) : null}
      </div>

      {design ? (
        <div className="design-controls">
          <ImageIcon size={12} />
          <input type="range" min={0} max={1} step={0.05} value={design.opacity} aria-label="Design overlay opacity" onChange={(e) => useRuntime.getState().setDesign(pane.id, { ...design, opacity: Number(e.target.value) })} />
          <button type="button" className={cx('chip', design.difference && 'on')} onClick={() => useRuntime.getState().setDesign(pane.id, { ...design, difference: !design.difference })}>
            Diff
          </button>
          <IconButton size="sm" title="Remove design overlay" onClick={() => useRuntime.getState().setDesign(pane.id, null)}>
            <X size={12} />
          </IconButton>
        </div>
      ) : null}

      {picker ? (
        <Popover anchor={picker} onClose={() => setPicker(null)} width={260}>
          <DevicePicker
            current={device.id}
            onPick={(id) => {
              update({ deviceId: id, rotated: false, width: undefined, height: undefined })
              setPicker(null)
            }}
          />
        </Popover>
      ) : null}

      {menu ? (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="end" width={236}>
          <div className="menu" role="menu" onClick={() => setMenu(null)}>
            <MenuItem icon={<ScrollText size={14} />} label="Full-page screenshot" onClick={() => void captureTab(tab.id, { paneId: pane.id, fullPage: true })} />
            <MenuItem icon={<Copy size={14} />} label="Copy screenshot" onClick={() => void copyShot()} />
            <MenuItem icon={<Code2 size={14} />} label="Open DevTools" onClick={() => void bridge.devtools(pane.id)} />
            <MenuItem icon={<ImageIcon size={14} />} label="Overlay a design image…" onClick={() => void pickDesign()} />
            <hr />
            <MenuItem icon={<Link2Off size={14} />} label="Mirror interactions" checked={!pane.unsynced} onClick={() => update({ unsynced: !pane.unsynced })} />
            <MenuItem icon={<Shield size={14} />} label="Isolated session" hint="own cookies" checked={!!pane.isolated} onClick={() => update({ isolated: !pane.isolated })} />
            {overridden ? <MenuItem icon={<Sun size={14} />} label="Clear emulation overrides" onClick={() => ws.setPaneOverride(tab.id, pane.id, null)} /> : null}
            <hr />
            <MenuItem icon={<ArrowLeft size={14} />} label="Move left" disabled={index === 0} onClick={() => ws.movePane(tab.id, pane.id, -1)} />
            <MenuItem icon={<ArrowRight size={14} />} label="Move right" disabled={index === tab.panes.length - 1} onClick={() => ws.movePane(tab.id, pane.id, 1)} />
            <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={duplicate} />
            <MenuItem icon={<Trash2 size={14} />} label="Remove" danger disabled={tab.panes.length === 1} onClick={() => ws.removePane(tab.id, pane.id)} />
          </div>
        </Popover>
      ) : null}
    </section>
  )
})
