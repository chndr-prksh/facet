import { ArrowRight, ClipboardPaste, Clock, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BUILTIN_DEVICES } from '@shared/devices'
import { cx } from '@ui'
import { deviceOf, paneName, paneSize, useStore } from '../store'
import { DeviceIcon, Pane } from './Pane'

const HEADER = 30
const PADDING = 22
const DEVICE_COUNT = BUILTIN_DEVICES.length - 1
const DEMO_URL = new URL('./demo/index.html', location.href).href

/** Shown before any page is open. */
function Welcome(): ReactNode {
  const recent = useStore((s) => s.recent)
  const open = useStore.getState().open
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = (text: string): void => {
    const before = useStore.getState().url
    open(text)
    if (useStore.getState().url === before) setError('That does not look like a web address. Try something like example.com')
  }
  const paste = async (): Promise<void> => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      setValue(text)
      if (text) submit(text)
    } catch {
      setError('Your browser did not allow reading the clipboard. Paste into the box instead.')
    }
  }

  return (
    <div className="start web-start">
      <div className="start-inner">
        <h1>Paste a link. See it on every screen.</h1>
        <p className="start-sub">
          Phones, tablets, laptops and desktops side by side, at their real sizes. {DEVICE_COUNT} device profiles, free, and nothing to install.
        </p>
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit(value)
          }}
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            placeholder="https://your-site.com or localhost:3000"
            spellCheck={false}
            autoCapitalize="off"
            aria-label="Website address"
            aria-invalid={!!error}
          />
          <button type="button" className="btn" onClick={() => void paste()}>
            <ClipboardPaste size={14} /> Paste
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            Open <ArrowRight size={14} />
          </button>
        </form>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="start-links">
          <button type="button" className="chip" onClick={() => open(DEMO_URL)}>
            <Sparkles size={12} /> Try the demo page
          </button>
          {recent.slice(0, 5).map((url) => (
            <button key={url} type="button" className="chip" onClick={() => open(url)} title={url}>
              <Clock size={12} /> {url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 38)}
            </button>
          ))}
        </div>
        <ul className="start-notes">
          <li>
            <b>Your own site, or one in development</b> works straight away, including <code>localhost</code>.
          </li>
          <li>
            <b>Many large sites refuse to be embedded</b> (Google, GitHub, YouTube and most banks). You will be told when that happens, and the free helper extension lifts it.
          </li>
          <li>
            <b>Sizes are exact.</b> Pixel density, touch and the user agent still come from your own browser; the desktop app emulates those too.
          </li>
        </ul>
      </div>
    </div>
  )
}

/** Lays out the device panes and works out the zoom that fits them. */
export function Stage(): ReactNode {
  const url = useStore((s) => s.url)
  const panes = useStore((s) => s.panes)
  const layout = useStore((s) => s.layout)
  const zoomSetting = useStore((s) => s.zoom)
  const frames = useStore((s) => s.frames)
  const compare = useStore((s) => !!s.compareUrl)
  const focusSetting = useStore((s) => s.focusId)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 1200, height: 700 })

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setBox({ width, height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const sizes = panes.map(paneSize)
  const focusId = panes.some((p) => p.id === focusSetting) ? focusSetting! : panes[0]?.id
  const focusIndex = panes.findIndex((p) => p.id === focusId)
  const frame = frames ? 70 : 0
  const room = box.height - HEADER - PADDING * 2 - frame - (layout === 'focus' ? 40 : 0) - 14

  let zoom: number
  if (typeof zoomSetting === 'number') zoom = zoomSetting
  else if (layout === 'focus' && sizes[focusIndex]) zoom = Math.min(1, room / sizes[focusIndex].height, (box.width - PADDING * 2 - frame) / (sizes[focusIndex].width * (compare ? 2 : 1)))
  else zoom = Math.min(1, room / Math.max(...sizes.map((s) => s.height), 1))
  zoom = Math.max(0.12, Math.round(zoom * 1000) / 1000)

  useEffect(() => useStore.setState({ effectiveZoom: zoom }), [zoom])

  return (
    <div className="stage bg-dots" ref={ref}>
      {layout === 'focus' && url ? (
        <div className="focus-chips">
          {panes.map((p) => (
            <button key={p.id} type="button" className={cx('chip', p.id === focusId && 'on')} onClick={() => useStore.setState({ focusId: p.id })}>
              <DeviceIcon kind={deviceOf(p.deviceId).kind} size={12} />
              {paneName(p)}
            </button>
          ))}
        </div>
      ) : null}
      {url ? (
        <div className={cx('stage-scroll', `layout-${layout}`)}>
          <div className="stage-inner">
            {panes.map((pane, index) => (
              <Pane key={pane.id} pane={pane} index={index} count={panes.length} zoom={zoom} hidden={layout === 'focus' && pane.id !== focusId} />
            ))}
          </div>
        </div>
      ) : (
        <Welcome />
      )}
    </div>
  )
}
