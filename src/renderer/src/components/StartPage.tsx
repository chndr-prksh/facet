import { ArrowRight, Clock, FolderOpen, RefreshCw, Server, Star } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DevServer } from '@shared/types'
import { displayUrl } from '@shared/urls'
import { bridge } from '@/lib/bridge'
import { navigate } from '@/lib/views'
import { useWorkspace } from '@/store/workspace'
import { Kbd } from './ui'

export function StartPage({ tabId }: { tabId: string }): ReactNode {
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const history = useWorkspace((s) => s.history)
  const [servers, setServers] = useState<DevServer[] | null>(null)
  const [value, setValue] = useState('')

  const scan = (): void => {
    setServers(null)
    void bridge.scanDevServers().then(setServers)
  }
  useEffect(scan, [])

  const go = (url: string): void => navigate(tabId, url)

  return (
    <div className="start">
      <div className="start-inner">
        <div className="start-mark">
          <svg viewBox="0 0 20 20" width="30" height="30" aria-hidden="true">
            <path d="M10 1 2 6v8l8 5 8-5V6z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M2 6l8 5 8-5M10 11v8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </div>
        <h1>Every viewport, at once.</h1>
        <p className="start-sub">Open a page to see it on all your devices, with interactions mirrored and problems flagged as you go.</p>

        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) go(value)
          }}
        >
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="localhost:3000 or example.com" spellCheck={false} aria-label="URL" />
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            Open <ArrowRight size={14} />
          </button>
        </form>

        <div className="start-grid">
          <section>
            <h3>
              <Server size={13} /> Running locally
              <button type="button" className="link" onClick={scan} aria-label="Rescan local servers">
                <RefreshCw size={11} />
              </button>
            </h3>
            {servers === null ? (
              <p className="dim">Looking for dev servers…</p>
            ) : servers.length === 0 ? (
              <p className="dim">No dev server found on the usual ports. Start one and rescan.</p>
            ) : (
              servers.map((s) => (
                <button key={s.port} type="button" className="start-item" onClick={() => go(s.url)}>
                  <span className="port">:{s.port}</span>
                  <span className="grow">{s.title ?? 'Untitled'}</span>
                </button>
              ))
            )}
            <button type="button" className="start-item" onClick={() => void bridge.pickHtml().then((path) => path && go(`file://${path}`))}>
              <FolderOpen size={13} />
              <span className="grow">Open an HTML file…</span>
            </button>
          </section>

          <section>
            <h3>
              <Star size={13} /> Bookmarks
            </h3>
            {bookmarks.length === 0 ? (
              <p className="dim">
                Press <Kbd keys="Mod+D" /> on any page to keep it here.
              </p>
            ) : (
              bookmarks.slice(0, 8).map((b) => (
                <button key={b.url} type="button" className="start-item" onClick={() => go(b.url)}>
                  <span className="grow">{b.title || displayUrl(b.url)}</span>
                  <span className="dim">{displayUrl(b.url)}</span>
                </button>
              ))
            )}
          </section>

          <section>
            <h3>
              <Clock size={13} /> Recent
            </h3>
            {history.length === 0 ? (
              <p className="dim">Pages you open will show up here.</p>
            ) : (
              history.slice(0, 8).map((h) => (
                <button key={h.url} type="button" className="start-item" onClick={() => go(h.url)}>
                  <span className="grow">{h.title || displayUrl(h.url)}</span>
                  <span className="dim">{displayUrl(h.url)}</span>
                </button>
              ))
            )}
          </section>
        </div>

        <p className="start-tip">
          <Kbd keys="Mod+K" /> opens every command · <Kbd keys="Mod+I" /> compares one element across devices · <Kbd keys="Mod+Shift+A" /> runs all audits
        </p>
      </div>
    </div>
  )
}
