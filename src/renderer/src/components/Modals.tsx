import { Check, Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Device, DeviceKind, DeviceOS } from '@shared/types'
import { normalizeUrl } from '@shared/urls'
import { bridge } from '@/lib/bridge'
import { buildCommands, type Command } from '@/lib/commands'
import { navigate } from '@/lib/views'
import { toast, useRuntime } from '@/store/runtime'
import { activeTab, allDevices, uid, useWorkspace } from '@/store/workspace'
import { DeviceIcon } from './PaneCard'
import { Kbd, Modal, Row, Segmented, Toggle, cx } from './ui'

/* ---------- command palette ---------- */

export function Palette(): ReactNode {
  const close = (): void => useRuntime.getState().set({ modal: null })
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const commands = useMemo(buildCommands, [])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matched = commands.filter((c) => words.every((w) => c.title.toLowerCase().includes(w) || c.group.toLowerCase().includes(w)))
    // Anything that looks like an address can be opened straight from here.
    if (/^(https?:\/\/|localhost|[\w-]+\.[a-z]{2,}|:\d+|\d+\.\d+)/i.test(query.trim())) {
      const url = normalizeUrl(query)
      matched.unshift({ id: 'goto', title: `Open ${url}`, group: 'Navigate', run: () => navigate(activeTab().id, url) })
    }
    return matched.slice(0, 60)
  }, [query, commands])

  useEffect(() => setCursor(0), [query])
  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in current Chromium, and
    // React would try to call a returned value as the effect's cleanup.
    void list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const run = (command?: Command): void => {
    if (!command) return
    close()
    command.run()
  }

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="search large">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Type a command, a device suite, or a URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setCursor((c) => Math.min(c + 1, results.length - 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setCursor((c) => Math.max(c - 1, 0)))
              else if (e.key === 'Enter') run(results[cursor])
              else if (e.key === 'Escape') close()
            }}
          />
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {results.length === 0 ? <p className="dim pad">No matching commands.</p> : null}
          {results.map((c, i) => (
            <button key={c.id} type="button" role="option" aria-selected={i === cursor} className={cx('palette-item', i === cursor && 'on')} onMouseMove={() => setCursor(i)} onClick={() => run(c)}>
              <span className="palette-group">{c.group}</span>
              <span className="grow">{c.title}</span>
              {c.active ? <Check size={13} className="accent" /> : null}
              {c.keys ? <Kbd keys={c.keys} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- shortcuts ---------- */

export function Shortcuts(): ReactNode {
  const commands = buildCommands().filter((c) => c.keys)
  const groups = [...new Set(commands.map((c) => c.group))]
  return (
    <Modal title="Keyboard shortcuts" onClose={() => useRuntime.getState().set({ modal: null })} width={640}>
      <div className="shortcut-grid">
        {groups.map((group) => (
          <section key={group}>
            <h4>{group}</h4>
            {commands
              .filter((c) => c.group === group)
              .map((c) => (
                <div key={c.id} className="shortcut">
                  <span>{c.title}</span>
                  <Kbd keys={c.keys!} />
                </div>
              ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}

/* ---------- device manager ---------- */

const KINDS: Array<{ value: DeviceKind | 'all' | 'custom'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'phone', label: 'Phones' },
  { value: 'foldable', label: 'Foldables' },
  { value: 'tablet', label: 'Tablets' },
  { value: 'laptop', label: 'Laptops' },
  { value: 'desktop', label: 'Desktops' },
  { value: 'custom', label: 'Custom' }
]

const BLANK: Device = { id: '', name: '', brand: 'Custom', kind: 'phone', os: 'android', width: 390, height: 844, dpr: 2, mobile: true, touch: true, custom: true, radius: 24 }

function DeviceForm({ initial, onDone }: { initial: Device; onDone: () => void }): ReactNode {
  const [d, setD] = useState(initial)
  const patch = (next: Partial<Device>): void => setD({ ...d, ...next })
  const num = (value: string, min: number, max: number): number => Math.min(max, Math.max(min, Number(value) || min))
  const valid = d.name.trim().length > 0
  return (
    <form
      className="device-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        useWorkspace.getState().upsertDevice({ ...d, id: d.id || `custom-${uid()}`, name: d.name.trim(), custom: true })
        onDone()
      }}
    >
      <label className="field wide">
        <span>Name</span>
        <input className="input" value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Kiosk display" autoFocus />
      </label>
      <label className="field">
        <span>Width</span>
        <input className="input" type="number" value={d.width} onChange={(e) => patch({ width: num(e.target.value, 120, 5120) })} />
      </label>
      <label className="field">
        <span>Height</span>
        <input className="input" type="number" value={d.height} onChange={(e) => patch({ height: num(e.target.value, 120, 5120) })} />
      </label>
      <label className="field">
        <span>Pixel ratio</span>
        <input className="input" type="number" step="0.25" value={d.dpr} onChange={(e) => patch({ dpr: num(e.target.value, 0.5, 5) })} />
      </label>
      <label className="field">
        <span>Type</span>
        <select
          className="select"
          value={d.kind}
          onChange={(e) => {
            const kind = e.target.value as DeviceKind
            const handheld = kind === 'phone' || kind === 'tablet'
            patch({ kind, mobile: handheld, touch: handheld })
          }}
        >
          <option value="phone">Phone</option>
          <option value="tablet">Tablet</option>
          <option value="laptop">Laptop</option>
          <option value="desktop">Desktop</option>
        </select>
      </label>
      <label className="field">
        <span>Platform</span>
        <select className="select" value={d.os} onChange={(e) => patch({ os: e.target.value as DeviceOS })}>
          <option value="ios">iOS</option>
          <option value="ipados">iPadOS</option>
          <option value="android">Android</option>
          <option value="macos">macOS</option>
          <option value="windows">Windows</option>
          <option value="chromeos">ChromeOS</option>
        </select>
      </label>
      <label className="field check">
        <input type="checkbox" checked={d.mobile} onChange={(e) => patch({ mobile: e.target.checked })} />
        <span>Mobile viewport</span>
      </label>
      <label className="field check">
        <input type="checkbox" checked={d.touch} onChange={(e) => patch({ touch: e.target.checked })} />
        <span>Touch screen</span>
      </label>
      <label className="field wide">
        <span>User agent (optional; blank derives one from the platform)</span>
        <input className="input mono" value={d.userAgent ?? ''} onChange={(e) => patch({ userAgent: e.target.value || undefined })} />
      </label>
      <div className="form-actions wide">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!valid}>
          {initial.id ? 'Save changes' : 'Add device'}
        </button>
      </div>
    </form>
  )
}

export function DeviceManager(): ReactNode {
  const close = (): void => useRuntime.getState().set({ modal: null })
  const custom = useWorkspace((s) => s.customDevices)
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0])
  const ws = useWorkspace.getState()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('all')
  const [editing, setEditing] = useState<Device | null>(null)

  const open = new Set(tab.panes.map((p) => p.deviceId))
  const devices = allDevices(custom)
    .filter((d) => d.kind !== 'responsive' && d.kind !== 'watch')
    .concat(allDevices(custom).filter((d) => d.kind === 'watch'))
    .filter((d) => (kind === 'all' ? true : kind === 'custom' ? d.custom : d.kind === kind))
    .filter((d) => `${d.name} ${d.brand} ${d.width}x${d.height}`.toLowerCase().includes(query.toLowerCase()))

  const toggle = (id: string): void => {
    const pane = tab.panes.find((p) => p.deviceId === id)
    if (pane) ws.removePane(tab.id, pane.id)
    else ws.addPane(tab.id, id)
  }

  return (
    <Modal
      title={editing ? (editing.id ? `Edit ${editing.name}` : 'New custom device') : 'Devices'}
      onClose={close}
      width={860}
      footer={
        editing ? undefined : (
          <>
            <span className="dim grow">{tab.panes.length} open in this tab. Click a device to add or remove it.</span>
            <button type="button" className="btn" onClick={() => setEditing(BLANK)}>
              <Plus size={13} /> Custom device
            </button>
            <button type="button" className="btn primary" onClick={close}>
              Done
            </button>
          </>
        )
      }
    >
      {editing ? (
        <DeviceForm initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <>
          <div className="dm-bar">
            <div className="search">
              <Search size={13} />
              <input autoFocus placeholder="Search by name or size" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Segmented size="sm" value={kind} onChange={setKind} options={KINDS} />
          </div>
          <div className="device-grid">
            {devices.map((d) => (
              <div key={d.id} className={cx('device-card', open.has(d.id) && 'on')}>
                <button type="button" className="device-main" onClick={() => toggle(d.id)} aria-pressed={open.has(d.id)}>
                  <span className="device-thumb">
                    <i style={{ aspectRatio: `${d.width} / ${d.height}`, height: d.width > d.height ? 'auto' : 34, width: d.width > d.height ? 44 : 'auto' }} />
                  </span>
                  <span className="device-text">
                    <b>{d.name}</b>
                    <span>
                      {d.width}×{d.height} · {Math.round(d.dpr * 100) / 100}x
                    </span>
                  </span>
                  <span className="device-check">{open.has(d.id) ? <Check size={13} /> : <DeviceIcon kind={d.kind} />}</span>
                </button>
                {d.custom ? (
                  <span className="device-edit">
                    <button type="button" title="Edit" aria-label={`Edit ${d.name}`} onClick={() => setEditing(d)}>
                      <Pencil size={12} />
                    </button>
                    <button type="button" title="Delete" aria-label={`Delete ${d.name}`} onClick={() => ws.deleteDevice(d.id)}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
            {devices.length === 0 ? <p className="dim pad">No devices match.</p> : null}
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------- settings ---------- */

function CopyBlock({ label, text }: { label: string; text: string }): ReactNode {
  return (
    <div className="copy-block">
      <span>{label}</span>
      <pre>{text}</pre>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          toast('Copied', 'success')
        }}
      >
        <Copy size={12} /> Copy
      </button>
    </div>
  )
}

export function SettingsModal(): ReactNode {
  const settings = useWorkspace((s) => s.settings)
  const info = useWorkspace((s) => s.info)
  const section = useRuntime((s) => s.settingsTab)
  const set = useWorkspace.getState().setSettings
  // Set by the app once the server has actually started or stopped.
  const status = useRuntime((s) => s.mcp)
  const [port, setPort] = useState(String(settings.mcpPort))

  const url = `http://127.0.0.1:${settings.mcpPort}/mcp`

  return (
    <Modal title="Settings" onClose={() => useRuntime.getState().set({ modal: null })} width={680}>
      <div className="settings-tabs">
        <Segmented value={section} onChange={(settingsTab) => useRuntime.getState().set({ settingsTab })} options={[{ value: 'general', label: 'General' }, { value: 'agents', label: 'AI agents' }, { value: 'about', label: 'About' }]} />
      </div>
      {section === 'general' ? (
        <div className="settings">
          <Row label="Interface theme">
            <Segmented size="sm" value={settings.theme} onChange={(theme) => set({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          </Row>
          <Row label="Canvas background" hint="A plain background keeps the surround from colouring your judgement of a design.">
            <Segmented size="sm" value={settings.stageBg} onChange={(stageBg) => set({ stageBg })} options={[{ value: 'dots', label: 'Dots' }, { value: 'plain', label: 'Plain' }, { value: 'checker', label: 'Checker' }]} />
          </Row>
          <Row label="Home page" hint="Opened in new tabs. Leave blank for the start page.">
            <input className="input" value={settings.homepage} placeholder="http://localhost:3000" onChange={(e) => set({ homepage: e.target.value.trim() })} />
          </Row>
          <Row label="Links that open a new window">
            <Segmented size="sm" value={settings.popups} onChange={(popups) => set({ popups })} options={[{ value: 'same', label: 'Open here' }, { value: 'external', label: 'Default browser' }]} />
          </Row>
          <Row label="Screenshot folder" hint={settings.screenshotDir || info?.screenshotDir}>
            <button type="button" className="btn" onClick={() => void bridge.pickFolder().then((dir) => dir && set({ screenshotDir: dir }))}>
              Choose…
            </button>
          </Row>
          <Row label="Accept invalid HTTPS certificates" hint="Local hosts are always accepted. Turn on only for staging servers you trust.">
            <Toggle checked={settings.ignoreCertErrors} onChange={(ignoreCertErrors) => set({ ignoreCertErrors })} />
          </Row>
        </div>
      ) : section === 'agents' ? (
        <div className="settings">
          <Row label="Model Context Protocol server" hint="Lets a coding agent on this machine drive Facet: open pages, screenshot every device, and run the audits.">
            <Toggle checked={settings.mcpEnabled} onChange={(mcpEnabled) => set({ mcpEnabled })} />
          </Row>
          <Row label="Port" hint="Listens on 127.0.0.1 only.">
            <input
              className="input short"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onBlur={() => {
                const next = Math.min(65535, Math.max(1024, Number(port) || 12790))
                setPort(String(next))
                set({ mcpPort: next })
              }}
            />
          </Row>
          <p className={cx('mcp-status', status?.running && 'on', status?.error && 'err')}>
            <i /> {status?.error ? status.error : status?.running ? `Listening at ${status.url}` : 'Not running'}
          </p>
          {settings.mcpEnabled ? (
            <>
              <CopyBlock label="Claude Code" text={`claude mcp add --transport http facet ${url}`} />
              <CopyBlock label="Cursor, VS Code and other clients (mcp.json)" text={JSON.stringify({ mcpServers: { facet: { url } } }, null, 2)} />
              <p className="dim">
                {info?.mcpTools.length} tools: {info?.mcpTools.join(', ')}.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="settings about">
          <h3>Facet {info?.version}</h3>
          <p>A browser for responsive web development. Every viewport at once, real device emulation, and audits that run across all of them.</p>
          <table className="kv">
            <tbody>
              <tr>
                <th>Chromium</th>
                <td>{info?.chrome}</td>
              </tr>
              <tr>
                <th>Electron</th>
                <td>{info?.electron}</td>
              </tr>
              <tr>
                <th>Platform</th>
                <td>{info?.platform}</td>
              </tr>
            </tbody>
          </table>
          <p className="dim">Pages render in Chromium. Safari- and Firefox-specific rendering bugs still need those browsers.</p>
        </div>
      )}
    </Modal>
  )
}

/* ---------- HTTP basic auth ---------- */

export function AuthPrompt(): ReactNode {
  const [request, setRequest] = useState<{ id: number; host: string; realm: string } | null>(null)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  useEffect(() => bridge.onAuthRequest(setRequest), [])
  if (!request) return null

  const answer = (creds: [string, string] | null): void => {
    void bridge.authRespond(request.id, creds)
    setRequest(null)
    setUser('')
    setPass('')
  }

  return (
    <Modal title="Sign in" onClose={() => answer(null)} width={380}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          answer([user, pass])
        }}
      >
        <p className="dim">
          {request.host} requires a username and password{request.realm ? ` (${request.realm})` : ''}. It is sent to every device in this tab.
        </p>
        <label className="field">
          <span>Username</span>
          <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoFocus autoComplete="off" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
        </label>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => answer(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Sign in
          </button>
        </div>
      </form>
    </Modal>
  )
}
