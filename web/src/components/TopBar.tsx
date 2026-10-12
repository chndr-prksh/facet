import { Check, CircleHelp, Columns2, Columns3, Frame, Grid3x3, Hand, LayoutGrid, Link2, Link2Off, Minus, MonitorSmartphone, Moon, Plus, RotateCcwSquare, RotateCw, Share2, Square, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton, Segmented, cx } from '@ui'
import { knownToBlock } from '../helper'
import { HELPER_AVAILABLE, REPO_URL, hostOf, shareLink, useStore } from '../store'

function zoomBy(factor: number): void {
  const s = useStore.getState()
  const current = typeof s.zoom === 'number' ? s.zoom : s.effectiveZoom
  s.set({ zoom: Math.min(1.5, Math.max(0.12, Math.round(current * factor * 20) / 20)) })
}

function Address(): ReactNode {
  const url = useStore((s) => s.url)
  const compareUrl = useStore((s) => s.compareUrl)
  const store = useStore.getState()
  const [value, setValue] = useState(url)
  const [comparing, setComparing] = useState(!!compareUrl)
  const [compareValue, setCompareValue] = useState(compareUrl)
  const [bad, setBad] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setValue(url), [url])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l')) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (): void => {
    const before = useStore.getState().url
    store.open(value)
    const after = useStore.getState().url
    // Same address again means "load it again".
    if (after === before && value.trim()) {
      if (after && (value.trim() === after || after.includes(value.trim()))) store.set({ reloadKey: useStore.getState().reloadKey + 1 })
      else setBad(true)
    }
    input.current?.blur()
  }

  return (
    <div className="address-wrap">
      <form
        className={cx('address', bad && 'invalid')}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={input}
          value={value}
          placeholder="Paste a website link, e.g. your-site.com or localhost:3000"
          spellCheck={false}
          autoCapitalize="off"
          aria-label="Website address"
          aria-invalid={bad}
          onChange={(e) => {
            setValue(e.target.value)
            setBad(false)
          }}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            // Pasting a whole link over the old one opens it straight away.
            const text = e.clipboardData.getData('text').trim()
            const all = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === e.currentTarget.value.length
            if (all && /^(https?:\/\/|localhost|[\w-]+(\.[\w-]+)+)/i.test(text) && !/\s/.test(text)) {
              e.preventDefault()
              setValue(text)
              store.open(text)
              e.currentTarget.blur()
            }
          }}
        />
        <IconButton
          size="sm"
          title={compareUrl ? 'Stop comparing' : 'Compare with a second link on every device'}
          active={comparing}
          onClick={() => {
            if (comparing) store.set({ compareUrl: '' })
            setComparing(!comparing)
          }}
        >
          <Columns2 size={13} />
        </IconButton>
        <button type="submit" className="btn primary go">
          Open
        </button>
      </form>
      {bad ? (
        <p className="form-error" role="alert">
          That does not look like a web address. Try something like example.com
        </p>
      ) : null}
      {comparing ? (
        <form
          className="address compare"
          onSubmit={(e) => {
            e.preventDefault()
            store.setCompare(compareValue)
          }}
        >
          <span className="address-tag">B</span>
          <input value={compareValue} placeholder="Second link to show beside the first, e.g. your live site" spellCheck={false} aria-label="Comparison address" onChange={(e) => setCompareValue(e.target.value)} autoFocus={!compareUrl} />
          <button type="submit" className="btn go">
            Compare
          </button>
        </form>
      ) : null}
    </div>
  )
}

export function TopBar(): ReactNode {
  const s = useStore()
  const [copied, setCopied] = useState(false)
  const helper = !!s.helperVersion

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this link', shareLink())
    }
  }

  return (
    <header className="web-top">
      <div className="web-row">
        <a className="web-brand" href="./" aria-label="Facet home" onClick={(e) => (e.preventDefault(), s.set({ url: '', compareUrl: '' }))}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M10 1 2 6v8l8 5 8-5V6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M2 6l8 5 8-5M10 11v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span>Facet</span>
        </a>
        <Address />
        <div className="tool-group">
          <button type="button" className={cx('tool-btn', copied && 'active')} onClick={() => void share()} title="Copy a link that opens this page on these devices" disabled={!s.url}>
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            <span className="label">{copied ? 'Copied' : 'Share'}</span>
          </button>
          <IconButton title={s.theme === 'dark' ? 'Light interface' : 'Dark interface'} onClick={() => s.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })}>
            {s.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton title="Help: blank panes, the helper extension, limits" active={s.help} onClick={() => s.set({ help: true })}>
            <CircleHelp size={15} />
          </IconButton>
          <a className="icon-btn" href={REPO_URL} target="_blank" rel="noopener" title="Source code and the desktop app on GitHub" aria-label="GitHub repository">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
            </svg>
          </a>
        </div>
      </div>

      <div className="web-row tools">
        <button type="button" className={cx('tool-btn', s.drawerOpen && 'active')} onClick={() => s.set({ drawerOpen: !s.drawerOpen })} aria-expanded={s.drawerOpen}>
          <MonitorSmartphone size={15} />
          <span className="label">Devices</span>
          <span className="count">{s.panes.length}</span>
        </button>
        <div className="tool-group">
          <IconButton title="Rotate all phones and tablets" onClick={s.rotateAll}>
            <RotateCcwSquare size={15} />
          </IconButton>
          <IconButton title="Reload every device" disabled={!s.url} onClick={() => s.set({ reloadKey: s.reloadKey + 1, frameUrls: {} })}>
            <RotateCw size={14} />
          </IconButton>
          <IconButton title="Device frames" active={s.frames} onClick={() => s.set({ frames: !s.frames })}>
            <Frame size={15} />
          </IconButton>
          <IconButton title="Column grid overlay" active={s.overlay === 'grid'} onClick={() => s.set({ overlay: s.overlay === 'grid' ? 'none' : 'grid' })}>
            <Grid3x3 size={15} />
          </IconButton>
          <IconButton title="Thumb reach overlay on touch devices" active={s.overlay === 'thumb'} onClick={() => s.set({ overlay: s.overlay === 'thumb' ? 'none' : 'thumb' })}>
            <Hand size={15} />
          </IconButton>
        </div>
        <div className="tool-group">
          <Segmented
            size="sm"
            value={s.layout}
            onChange={(layout) => s.set({ layout })}
            options={[
              { value: 'row', label: <Columns3 size={14} />, title: 'Side by side' },
              { value: 'wrap', label: <LayoutGrid size={14} />, title: 'Wrap onto rows' },
              { value: 'focus', label: <Square size={14} />, title: 'One device at a time' }
            ]}
          />
          <div className="zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
              <Minus size={12} />
            </button>
            <button type="button" className={cx('zoom-value', s.zoom === 'fit' && 'fit')} title={s.zoom === 'fit' ? 'Fitting the window. Click for actual size' : 'Click to fit the window'} onClick={() => s.set({ zoom: s.zoom === 'fit' ? 1 : 'fit' })}>
              {s.zoom === 'fit' ? 'Fit ' : ''}
              {Math.round(s.effectiveZoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
              <Plus size={12} />
            </button>
          </div>
        </div>
        {HELPER_AVAILABLE || helper ? (
        <button
          type="button"
          className={cx('tool-btn right', helper && s.mirror && 'active')}
          title={helper ? 'Mirror scrolling, clicks and typing across devices' : 'Mirroring needs the free helper extension. Click to see how to add it'}
          onClick={() => (helper ? s.set({ mirror: !s.mirror }) : s.set({ help: true }))}
        >
          {helper && s.mirror ? <Link2 size={15} /> : <Link2Off size={15} />}
          <span className="label">{helper ? (s.mirror ? 'Mirroring on' : 'Mirroring off') : 'Helper not installed'}</span>
        </button>
        ) : null}
      </div>
    </header>
  )
}

/** Explains a blank pane before the user has to wonder about it. */
export function BlockedBanner(): ReactNode {
  const url = useStore((s) => s.url)
  const compareUrl = useStore((s) => s.compareUrl)
  const helper = useStore((s) => !!s.helperVersion)
  const embed = useStore((s) => s.embed)
  const dismissed = useStore((s) => s.bannerDismissed)
  if (helper) return null
  // The probe is authoritative; the list of known sites covers the moment before it answers.
  const blocked = [url, compareUrl].find((u) => u && (embed[u] === 'blocked' || (embed[u] !== 'ok' && knownToBlock(u))))
  if (!blocked) return null
  const host = hostOf(blocked).replace(/^www\./, '')
  if (dismissed.includes(host)) return null
  return (
    <div className="banner" role="status">
      <span>
        <b>{host} cannot be shown here.</b> It tells browsers not to display it inside other pages (or it could not be reached), so its panes stay blank. That is the site's own
        setting, not a fault in the page.
      </span>
      <button type="button" className="btn" onClick={() => useStore.setState({ help: true })}>
        How to view it anyway
      </button>
      <a className="btn ghost" href={blocked} target="_blank" rel="noopener">
        Open in a new tab
      </a>
      <IconButton size="sm" title="Dismiss" onClick={() => useStore.setState({ bannerDismissed: [...dismissed, host] })}>
        <X size={13} />
      </IconButton>
    </div>
  )
}
