import { ArrowLeft, ArrowRight, BookOpen, Ellipsis, ExternalLink, Laptop, Monitor, MoveHorizontal, RotateCcwSquare, RotateCw, Scaling, ShieldAlert, Smartphone, Speaker, Tablet, Trash2, Tv, Watch } from 'lucide-react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Device } from '@shared/types'
import { IconButton, MenuItem, Popover, cx } from '@ui'
import { deviceOf, paneSize, useStore, type Overlay, type WebPane } from '../store'

const KIND_ICON = { phone: Smartphone, foldable: BookOpen, tablet: Tablet, laptop: Laptop, desktop: Monitor, tv: Tv, watch: Watch, other: Speaker, responsive: Scaling }

export const DeviceIcon = ({ kind, size = 13 }: { kind: Device['kind']; size?: number }): ReactNode => {
  const Icon = KIND_ICON[kind]
  return <Icon size={size} />
}

// Scripts and same-origin are needed for sites to work at all. Top navigation
// is withheld, so a framed page can never replace this tool with itself.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'

const clamp = (value: number, min: number, max: number): number => Math.round(Math.min(max, Math.max(min, value)))

interface FrameProps {
  frameKey: string
  url: string
  title: string
  width: number
  height: number
  zoom: number
  overlay: Overlay
  touch: boolean
}

function Frame({ frameKey, url, title, width, height, zoom, overlay, touch }: FrameProps): ReactNode {
  const reloadKey = useStore((s) => s.reloadKey)
  const blocked = useStore((s) => !s.helperVersion && s.embed[url] === 'blocked')
  const [src, setSrc] = useState(url)
  const [loaded, setLoaded] = useState(false)

  // A frame that already navigated itself to the new address (the helper
  // reported it) is left alone; reloading it would throw away its state.
  useEffect(() => {
    if (useStore.getState().frameUrls[frameKey] !== url) {
      setSrc(url)
      setLoaded(false)
    }
  }, [url, frameKey])
  useEffect(() => setLoaded(false), [reloadKey])

  const columns = width < 600 ? 4 : width < 1024 ? 8 : 12
  return (
    <div className="wv-wrap" style={{ width: width * zoom, height: height * zoom }}>
      <iframe
        key={reloadKey}
        name={`facet:${frameKey}`}
        className="frame"
        src={src}
        title={title}
        sandbox={SANDBOX}
        allow="fullscreen; clipboard-write"
        style={{ width, height, transform: `scale(${zoom})` }}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && !blocked ? (
        <div className="frame-loading" role="status">
          <span className="spinner" />
          Loading…
        </div>
      ) : null}
      {blocked ? (
        <div className="wv-error blocked">
          <ShieldAlert size={20} />
          <strong>This site refuses to be embedded</strong>
          <button type="button" className="link" onClick={() => useStore.setState({ help: true })}>
            How to view it anyway
          </button>
        </div>
      ) : null}
      {overlay === 'grid' ? (
        <div className="ov ov-grid" style={{ padding: `0 ${(width < 600 ? 16 : 24) * zoom}px`, gap: (width < 1024 ? 16 : 24) * zoom }} aria-hidden="true">
          {Array.from({ length: columns }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : null}
      {overlay === 'thumb' && touch ? <div className="ov ov-thumb" aria-hidden="true" /> : null}
    </div>
  )
}

interface Props {
  pane: WebPane
  index: number
  count: number
  zoom: number
  hidden: boolean
}

export const Pane = memo(function Pane({ pane, index, count, zoom, hidden }: Props): ReactNode {
  const url = useStore((s) => s.url)
  const compareUrl = useStore((s) => s.compareUrl)
  const frames = useStore((s) => s.frames)
  const overlay = useStore((s) => s.overlay)
  const overflow = useStore((s) => s.overflow[pane.id] ?? 0)
  const store = useStore.getState()
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement>(null)

  const device = deviceOf(pane.deviceId)
  const { width, height } = paneSize(pane)
  const free = device.kind === 'responsive'
  const compare = !!compareUrl
  const framed = frames && !compare && (device.kind === 'phone' || device.kind === 'tablet' || device.kind === 'foldable' || device.kind === 'watch')
  const radius = framed ? (device.radius ?? 0) * zoom : 0
  const bezel = framed ? Math.max(5, 11 * zoom) : 0
  const hasCutout = !!device.cutout && device.cutout !== 'none'
  const strip = framed && hasCutout ? (device.safeArea?.top ?? 0) * zoom : 0
  const cardWidth = width * zoom * (compare ? 2 : 1) + (compare ? 8 : 0) + bezel * 2 + (pane.rotated ? strip : 0)
  const compact = cardWidth < 230

  const rotate = (): void => (free ? store.updatePane(pane.id, { width: height, height: width }) : store.updatePane(pane.id, { rotated: !pane.rotated }))

  const startResize = (e: React.PointerEvent, axis: 'x' | 'y' | 'xy'): void => {
    e.preventDefault()
    const origin = { x: e.clientX, y: e.clientY, width, height }
    // Frames swallow pointer events; park them while a handle is being dragged.
    document.body.classList.add('dragging')
    const move = (ev: PointerEvent): void =>
      store.updatePane(pane.id, {
        width: axis === 'y' ? origin.width : clamp(origin.width + (ev.clientX - origin.x) / zoom, 160, 5120),
        height: axis === 'x' ? origin.height : clamp(origin.height + (ev.clientY - origin.y) / zoom, 160, 2880)
      })
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      document.body.classList.remove('dragging')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  return (
    <section className={cx('pane', hidden && 'is-hidden')} style={{ width: cardWidth }} aria-label={device.name}>
      <header className="pane-head">
        <span className="pane-name static" title={`${device.name} · ${width}×${height} @${device.dpr}x`}>
          <DeviceIcon kind={device.kind} />
          <span>{device.name}</span>
        </span>
        {free ? (
          <span className="pane-dims editable">
            <input aria-label="Width" type="number" value={width} min={160} max={5120} onChange={(e) => store.updatePane(pane.id, { width: clamp(Number(e.target.value) || 160, 160, 5120) })} />
            ×
            <input aria-label="Height" type="number" value={height} min={160} max={2880} onChange={(e) => store.updatePane(pane.id, { height: clamp(Number(e.target.value) || 160, 160, 2880) })} />
          </span>
        ) : compact ? null : (
          <span className="pane-dims" title={device.approx ? 'Estimated from the panel resolution' : undefined}>
            {device.approx ? '≈' : ''}
            {width}×{height}
            <i>@{Math.round(device.dpr * 100) / 100}x</i>
          </span>
        )}
        <span className="pane-badges">
          {overflow > 0 ? (
            <span className="badge red" title={`This page is ${overflow}px wider than the screen, so it scrolls sideways`}>
              <MoveHorizontal size={11} />
              {compact ? '' : `+${overflow}px`}
            </span>
          ) : null}
        </span>
        <span className="pane-actions">
          <IconButton size="sm" title="Rotate" active={pane.rotated} disabled={!device.mobile && !free} onClick={rotate}>
            <RotateCcwSquare size={13} />
          </IconButton>
          <IconButton size="sm" title="Reload this device" onClick={() => body.current?.querySelectorAll('iframe').forEach((f) => (f.src = f.src))}>
            <RotateCw size={13} />
          </IconButton>
          <IconButton size="sm" title="More" active={!!menu} onClick={(e) => setMenu(e.currentTarget)}>
            <Ellipsis size={13} />
          </IconButton>
        </span>
      </header>

      <div ref={body} className={cx('pane-body', framed && 'framed')} style={framed ? { padding: bezel, borderRadius: radius + bezel } : undefined}>
        <div className="pane-screen" style={{ borderRadius: radius, flexDirection: strip ? (pane.rotated ? 'row' : 'column') : undefined, gap: strip ? 0 : undefined }}>
          {strip ? (
            <div className="status-strip" style={pane.rotated ? { width: strip } : { height: strip, fontSize: 15 * zoom, padding: `0 ${30 * zoom}px` }}>
              {pane.rotated ? null : '9:41'}
            </div>
          ) : null}
          <div className="side-slot">
            <Frame frameKey={pane.id} url={url} title={`${device.name} preview`} width={width} height={height} zoom={zoom} overlay={overlay} touch={device.touch} />
            {compare ? <span className="side-tag">A</span> : null}
          </div>
          {compare ? (
            <div className="side-slot">
              <Frame frameKey={`${pane.id}:b`} url={compareUrl} title={`${device.name} comparison preview`} width={width} height={height} zoom={zoom} overlay={overlay} touch={device.touch} />
              <span className="side-tag">B</span>
            </div>
          ) : null}
          {framed && hasCutout ? <div className={cx('cutout', device.cutout, pane.rotated && 'rotated')} style={{ transform: `scale(${zoom})` }} /> : null}
          {framed && (device.os === 'ios' || device.os === 'ipados') && hasCutout ? <div className={cx('home-bar', pane.rotated && 'rotated')} style={{ width: 134 * zoom, height: Math.max(2, 5 * zoom), bottom: 8 * zoom }} /> : null}
        </div>
        {free ? (
          <>
            <div className="resize-handle x" onPointerDown={(e) => startResize(e, 'x')} title="Drag to resize" />
            <div className="resize-handle y" onPointerDown={(e) => startResize(e, 'y')} title="Drag to resize" />
            <div className="resize-handle xy" onPointerDown={(e) => startResize(e, 'xy')} title="Drag to resize" />
          </>
        ) : null}
      </div>

      {menu ? (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="end" width={220}>
          <div className="menu" role="menu" onClick={() => setMenu(null)}>
            <MenuItem icon={<ExternalLink size={14} />} label="Open page in a new tab" onClick={() => window.open(url, '_blank', 'noopener')} />
            <MenuItem icon={<Monitor size={14} />} label="Show only this device" onClick={() => store.set({ layout: 'focus', focusId: pane.id })} />
            <hr />
            <MenuItem icon={<ArrowLeft size={14} />} label="Move left" disabled={index === 0} onClick={() => store.movePane(pane.id, -1)} />
            <MenuItem icon={<ArrowRight size={14} />} label="Move right" disabled={index === count - 1} onClick={() => store.movePane(pane.id, 1)} />
            <MenuItem icon={<Trash2 size={14} />} label="Remove" danger disabled={count === 1} onClick={() => store.removePane(pane.id)} />
          </div>
        </Popover>
      ) : null}
    </section>
  )
})
