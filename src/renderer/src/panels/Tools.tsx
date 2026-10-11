import { Code2, Crosshair, FolderOpen, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ConsoleLevel, CookieInfo, Snippet, Tab } from '@shared/types'
import { clearSiteData, measureEverywhere, setInspecting, viewLabel } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import { exec, getView, highlight, primaryViewId, reload, viewsOfTab } from '@/lib/views'
import { toast, useRuntime } from '@/store/runtime'
import { uid, useWorkspace } from '@/store/workspace'
import { Empty, IconButton, Segmented, Sev, cx } from '@/components/ui'

/* ---------- element compare ---------- */

const STYLE_ROWS: Array<[string, string]> = [
  ['display', 'display'],
  ['position', 'position'],
  ['fontSize', 'font-size'],
  ['lineHeight', 'line-height'],
  ['fontWeight', 'font-weight'],
  ['padding', 'padding'],
  ['margin', 'margin'],
  ['flexDirection', 'flex-direction'],
  ['gridTemplateColumns', 'grid columns'],
  ['gap', 'gap'],
  ['textAlign', 'text-align'],
  ['color', 'color'],
  ['backgroundColor', 'background']
]

export function InspectPanel({ tab }: { tab: Tab }): ReactNode {
  const picked = useRuntime((s) => s.picked)
  const reports = useRuntime((s) => s.elementReports)
  const inspecting = useRuntime((s) => s.inspecting)
  const [selector, setSelector] = useState(picked?.selector ?? '')
  useEffect(() => setSelector(picked?.selector ?? ''), [picked])
  // The outline around the measured element only makes sense while this panel is showing.
  useEffect(() => () => viewsOfTab(tab.id).forEach((ref) => highlight(ref.viewId, undefined)), [tab.id])

  const views = viewsOfTab(tab.id).filter((r) => reports[r.viewId])
  const measure = (value: string): void => {
    if (!value.trim()) return
    useRuntime.getState().set({ picked: { selector: value.trim(), viewId: primaryViewId(tab.id) ?? '' } })
    void measureEverywhere(tab.id, value.trim())
  }
  const differs = (values: string[]): boolean => new Set(values).size > 1

  const rows: Array<{ label: string; values: string[] }> = views.length
    ? [
        { label: 'visible', values: views.map((r) => (!reports[r.viewId].found ? 'not in DOM' : reports[r.viewId].visible ? 'yes' : 'hidden')) },
        { label: 'width', values: views.map((r) => (reports[r.viewId].found ? `${reports[r.viewId].rect.width}px` : '–')) },
        { label: 'height', values: views.map((r) => (reports[r.viewId].found ? `${reports[r.viewId].rect.height}px` : '–')) },
        { label: 'x, y', values: views.map((r) => (reports[r.viewId].found ? `${reports[r.viewId].rect.x}, ${reports[r.viewId].rect.y}` : '–')) },
        ...STYLE_ROWS.map(([key, label]) => ({ label, values: views.map((r) => reports[r.viewId].styles[key] ?? '–') }))
      ]
    : []

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <button type="button" className={cx('btn', inspecting ? 'primary' : '')} onClick={() => setInspecting(tab.id, !inspecting)}>
          <Crosshair size={12} /> {inspecting ? 'Click an element…' : 'Pick element'}
        </button>
        <input className="input mono grow" placeholder="or type a CSS selector" value={selector} onChange={(e) => setSelector(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && measure(selector)} aria-label="CSS selector" />
      </div>
      <div className="panel-scroll">
        {!views.length ? (
          <Empty icon={<Crosshair size={22} />} title="One element, every viewport">Pick an element in any device to see its size and computed styles side by side on all of them. Rows that differ are highlighted.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="compare">
                <thead>
                  <tr>
                    <th />
                    {views.map((r) => (
                      <th key={r.viewId}>{viewLabel(r.viewId)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className={cx(differs(row.values) && 'differs')}>
                      <th>{row.label}</th>
                      {row.values.map((value, i) => (
                        <td key={i}>
                          {/^rgb/.test(value) ? <span className="swatch" style={{ background: value }} /> : null}
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-bar">
              <button type="button" className="btn ghost" onClick={() => picked && void bridge.devtools(picked.viewId)}>
                <Code2 size={12} /> Open DevTools
              </button>
              <button type="button" className="btn ghost" onClick={() => measure(selector)}>
                <RefreshCw size={12} /> Re-measure
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- console ---------- */

type Filter = 'all' | 'errors' | 'warnings' | 'network'

export function ConsolePanel({ tab }: { tab: Tab }): ReactNode {
  const entries = useRuntime((s) => s.console)
  const [filter, setFilter] = useState<Filter>('all')

  const groups = useMemo(() => {
    const matches = (level: ConsoleLevel): boolean => filter === 'all' || (filter === 'errors' && level === 'error') || (filter === 'warnings' && level === 'warn') || (filter === 'network' && level === 'network')
    const map = new Map<string, { level: ConsoleLevel; message: string; source?: string; line?: number; views: Set<string>; count: number; last: number }>()
    for (const e of entries) {
      if (e.tabId !== tab.id || !matches(e.level)) continue
      // The same message from five devices is one line with five chips.
      const key = `${e.level}|${e.message}`
      const group = map.get(key)
      if (group) {
        group.views.add(e.paneId)
        group.count++
        group.last = e.id
      } else map.set(key, { level: e.level, message: e.message, source: e.source, line: e.line, views: new Set([e.paneId]), count: 1, last: e.id })
    }
    return [...map.values()].sort((a, b) => a.last - b.last).slice(-300)
  }, [entries, filter, tab.id])

  const total = viewsOfTab(tab.id).length
  return (
    <div className="panel-content">
      <div className="panel-bar">
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'errors', label: 'Errors' }, { value: 'warnings', label: 'Warnings' }, { value: 'network', label: 'Network' }]} />
        <button type="button" className="btn ghost right" onClick={() => useRuntime.getState().clearConsole(tab.id)}>
          <Trash2 size={12} /> Clear
        </button>
      </div>
      <div className="panel-scroll console">
        {groups.length === 0 ? (
          <Empty title="Console is quiet">Messages from every device land here, merged. A message from only some devices is a viewport-specific bug.</Empty>
        ) : (
          groups.map((g, i) => (
            <div key={i} className={cx('log', g.level)}>
              <Sev level={g.level === 'error' || g.level === 'network' ? 'error' : g.level === 'warn' ? 'warn' : 'info'} />
              <div className="log-body">
                <pre>{g.message}</pre>
                <div className="log-meta">
                  {g.views.size === total && total > 1 ? (
                    <span className="chip tiny">all devices</span>
                  ) : (
                    [...g.views].map((id) => (
                      <span key={id} className="chip tiny on">
                        {viewLabel(id)}
                      </span>
                    ))
                  )}
                  {g.count > g.views.size ? <span className="dim">×{g.count}</span> : null}
                  {g.source ? (
                    <span className="dim src">
                      {g.source.split('/').pop()}
                      {g.line ? `:${g.line}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ---------- storage ---------- */

interface StorageDump {
  local: Array<[string, string]>
  session: Array<[string, string]>
}

function readStorage(): StorageDump {
  const dump = (store: Storage): Array<[string, string]> => {
    const out: Array<[string, string]> = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key !== null) out.push([key, (store.getItem(key) ?? '').slice(0, 2000)])
    }
    return out
  }
  try {
    return { local: dump(localStorage), session: dump(sessionStorage) }
  } catch {
    return { local: [], session: [] }
  }
}

export function StoragePanel({ tab }: { tab: Tab }): ReactNode {
  const [cookies, setCookies] = useState<CookieInfo[]>([])
  const [storage, setStorage] = useState<StorageDump>({ local: [], session: [] })
  const [view, setView] = useState<'cookies' | 'local' | 'session'>('cookies')
  const url = useRuntime((s) => s.views[tab.panes[0]?.id]?.url ?? '')
  const viewId = primaryViewId(tab.id) ?? ''
  const partition = tab.panes[0]?.isolated ? `persist:facet-${tab.panes[0].id}` : 'persist:facet'

  const refresh = async (): Promise<void> => {
    if (!/^https?:/.test(url)) return
    setCookies(await bridge.cookies(partition, url))
    setStorage(await exec(viewId, readStorage).catch(() => ({ local: [], session: [] })))
  }
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  if (!/^https?:/.test(url)) return <Empty title="No site loaded">Cookies and storage appear once a page is open.</Empty>

  const removeItem = async (kind: 'local' | 'session', key: string): Promise<void> => {
    await exec(viewId, (k: string, name: string) => (k === 'local' ? localStorage : sessionStorage).removeItem(name), kind, key).catch(() => {})
    void refresh()
  }
  const rows = view === 'local' ? storage.local : storage.session

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'cookies', label: `Cookies ${cookies.length}` }, { value: 'local', label: `Local ${storage.local.length}` }, { value: 'session', label: `Session ${storage.session.length}` }]} />
        <button type="button" className="btn ghost" onClick={() => void refresh()} title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="panel-scroll">
        {view === 'cookies' ? (
          cookies.length === 0 ? (
            <Empty title="No cookies for this site" />
          ) : (
            cookies.map((c) => (
              <div key={`${c.domain}${c.path}${c.name}`} className="outline-row static kv-row">
                <span className="grow">
                  <b>{c.name}</b>
                  <i>{c.value || '(empty)'}</i>
                  <span className="chip-wrap">
                    <span className="chip tiny">{c.domain}</span>
                    {c.secure ? <span className="chip tiny">Secure</span> : null}
                    {c.httpOnly ? <span className="chip tiny">HttpOnly</span> : null}
                    <span className="chip tiny">SameSite={c.sameSite}</span>
                    <span className="chip tiny">{c.expires ? new Date(c.expires * 1000).toLocaleDateString() : 'session'}</span>
                  </span>
                </span>
                <IconButton size="sm" title={`Delete ${c.name}`} onClick={() => void bridge.removeCookie(partition, url, c.name).then(refresh)}>
                  <X size={12} />
                </IconButton>
              </div>
            ))
          )
        ) : rows.length === 0 ? (
          <Empty title={`No ${view} storage for this site`} />
        ) : (
          rows.map(([key, value]) => (
            <div key={key} className="outline-row static kv-row">
              <span className="grow">
                <b>{key}</b>
                <i>{value}</i>
              </span>
              <IconButton size="sm" title={`Delete ${key}`} onClick={() => void removeItem(view as 'local' | 'session', key)}>
                <X size={12} />
              </IconButton>
            </div>
          ))
        )}
      </div>
      <div className="panel-bar foot">
        <button type="button" className="btn ghost" onClick={() => void clearSiteData(tab.id, ['cookies']).then(refresh)}>
          Clear cookies
        </button>
        <button type="button" className="btn ghost" onClick={() => void clearSiteData(tab.id, ['storage']).then(refresh)}>
          Clear storage
        </button>
        <button type="button" className="btn ghost" onClick={() => void clearSiteData(tab.id, ['cookies', 'storage', 'cache']).then(() => reload(tab.id))}>
          Clear all and reload
        </button>
      </div>
    </div>
  )
}

/* ---------- live CSS, snippets, live reload ---------- */

export function InjectPanel({ tab }: { tab: Tab }): ReactNode {
  const snippets = useWorkspace((s) => s.snippets)
  const ws = useWorkspace.getState()
  const [css, setCss] = useState(tab.liveCss)
  const [editing, setEditing] = useState<Snippet | null>(null)
  const [output, setOutput] = useState<Array<{ device: string; text: string; error: boolean }>>([])

  useEffect(() => setCss(tab.liveCss), [tab.id])
  // Debounced so each keystroke does not restyle every pane.
  useEffect(() => {
    const timer = setTimeout(() => css !== tab.liveCss && ws.updateTab(tab.id, { liveCss: css }), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [css])

  const run = async (snippet: Snippet): Promise<void> => {
    const results = await Promise.all(
      viewsOfTab(tab.id).map(async (ref) => {
        const view = getView(ref.viewId)
        if (!view) return null
        try {
          const value = await view.executeJavaScript(`(async () => { ${snippet.code}\n })()`, true)
          return { device: viewLabel(ref.viewId), text: value === undefined ? 'done' : JSON.stringify(value, null, 1)?.slice(0, 600), error: false }
        } catch (err) {
          return { device: viewLabel(ref.viewId), text: (err as Error).message, error: true }
        }
      })
    )
    setOutput(results.filter((r): r is NonNullable<typeof r> => r !== null))
  }

  const pickWatch = async (): Promise<void> => {
    const dir = await bridge.pickFolder()
    if (dir) {
      ws.updateTab(tab.id, { watchDir: dir })
      toast('Watching for changes', 'success')
    }
  }

  return (
    <div className="panel-content">
      <div className="panel-scroll">
        <section className="group">
          <h4>
            Live CSS
            {css.trim() ? (
              <button type="button" className="link" onClick={() => setCss('')}>
                Clear
              </button>
            ) : null}
          </h4>
          <textarea className="input mono code" rows={7} spellCheck={false} placeholder={'/* Applied to every device as you type */\n.hero { outline: 2px dashed red; }'} value={css} onChange={(e) => setCss(e.target.value)} aria-label="Live CSS" />
        </section>

        <section className="group">
          <h4>
            Snippets
            <button type="button" className="link" onClick={() => setEditing({ id: uid(), name: '', code: '' })}>
              <Plus size={11} /> New
            </button>
          </h4>
          {editing ? (
            <div className="stack">
              <input className="input" placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              <textarea className="input mono code" rows={5} spellCheck={false} placeholder={'// Runs in every device. Return a value to see it.\nreturn document.querySelectorAll("img").length'} value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              <div className="panel-bar">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!editing.code.trim()}
                  onClick={() => {
                    ws.upsertSnippet({ ...editing, name: editing.name.trim() || 'Untitled' })
                    setEditing(null)
                  }}
                >
                  Save
                </button>
                <button type="button" className="btn ghost" onClick={() => void run(editing)} disabled={!editing.code.trim()}>
                  <Play size={12} /> Run
                </button>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : snippets.length === 0 ? (
            <p className="dim pad">Save bits of JavaScript and run them in every device at once: log in, seed a cart, dismiss a banner.</p>
          ) : (
            snippets.map((s) => (
              <div key={s.id} className="outline-row static">
                <button type="button" className="grow link-like" onClick={() => setEditing(s)}>
                  {s.name}
                </button>
                <IconButton size="sm" title={`Run ${s.name} in all devices`} onClick={() => void run(s)}>
                  <Play size={12} />
                </IconButton>
                <IconButton size="sm" title={`Delete ${s.name}`} onClick={() => ws.deleteSnippet(s.id)}>
                  <Trash2 size={12} />
                </IconButton>
              </div>
            ))
          )}
          {output.map((o, i) => (
            <div key={i} className={cx('log', o.error && 'error')}>
              <Sev level={o.error ? 'error' : 'ok'} />
              <div className="log-body">
                <pre>{o.text}</pre>
                <div className="log-meta">
                  <span className="chip tiny on">{o.device}</span>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="group">
          <h4>Live reload</h4>
          <p className="dim pad">Dev servers with hot reload already work in every device. For static files, watch a folder: CSS edits swap in place, anything else reloads.</p>
          {tab.watchDir ? (
            <div className="outline-row static">
              <FolderOpen size={13} />
              <code className="grow">{tab.watchDir}</code>
              <IconButton size="sm" title="Stop watching" onClick={() => ws.updateTab(tab.id, { watchDir: undefined })}>
                <X size={12} />
              </IconButton>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => void pickWatch()}>
              <FolderOpen size={12} /> Watch a folder…
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
