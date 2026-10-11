import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  Columns3,
  Crosshair,
  Diff,
  Frame,
  Hand,
  Layers,
  LayoutGrid,
  Link2,
  Minus,
  MonitorSmartphone,
  Moon,
  PanelRight,
  Plus,
  RotateCcwSquare,
  RotateCw,
  Scaling,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  SunMoon,
  X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FRAMEWORK_BREAKPOINTS } from '@shared/devices'
import { DEFAULT_EMULATION, type Emulation, type Tab } from '@shared/types'
import { addResponsivePane, captureTab, openStudio, setInspecting } from '@/lib/actions'
import { zoomBy } from '@/lib/commands'
import { diffPane } from '@/lib/diff'
import { OVERLAYS } from '@/lib/overlays'
import { goHistory, reload, stopLoading } from '@/lib/views'
import { useRuntime } from '@/store/runtime'
import { allSuites, deviceById, paneLabel, useWorkspace } from '@/store/workspace'
import { AddressBar } from './AddressBar'
import { DeviceIcon } from './PaneCard'
import { IconButton, Kbd, MenuItem, PopoverButton, Row, Segmented, Toggle, cx } from './ui'

const VISION: Array<[Emulation['vision'], string]> = [
  ['none', 'Normal vision'],
  ['blurredVision', 'Blurred vision'],
  ['reducedContrast', 'Reduced contrast'],
  ['deuteranopia', 'Deuteranopia (no green)'],
  ['protanopia', 'Protanopia (no red)'],
  ['tritanopia', 'Tritanopia (no blue)'],
  ['achromatopsia', 'Achromatopsia (no colour)']
]

const changedCount = (emulation: Emulation): number =>
  (Object.keys(DEFAULT_EMULATION) as Array<keyof Emulation>).filter((key) => JSON.stringify(emulation[key]) !== JSON.stringify(DEFAULT_EMULATION[key])).length

function EmulationPanel({ tab }: { tab: Tab }): ReactNode {
  const ws = useWorkspace.getState()
  const e = tab.emulation
  const set = (patch: Partial<Emulation>): void => ws.setEmulation(tab.id, patch)
  const [advanced, setAdvanced] = useState(!!(e.userAgent || e.locale || e.timezone || e.geolocation || e.headers))
  const geo = e.geolocation ? `${e.geolocation.latitude}, ${e.geolocation.longitude}` : ''

  return (
    <div className="panel-pop">
      <div className="pop-head">
        <strong>Emulation</strong>
        <button type="button" className="link" onClick={() => set({ ...DEFAULT_EMULATION })}>
          Reset
        </button>
      </div>
      <p className="pop-note">Applies to every device in this tab. Per-device overrides live on each pane.</p>
      <Row label="Colour scheme">
        <Segmented size="sm" value={e.colorScheme} onChange={(colorScheme) => set({ colorScheme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Row>
      <Row label="Contrast">
        <Segmented size="sm" value={e.contrast} onChange={(contrast) => set({ contrast })} options={[{ value: 'no-preference', label: 'Default' }, { value: 'more', label: 'More' }, { value: 'less', label: 'Less' }]} />
      </Row>
      <Row label="Reduced motion">
        <Toggle checked={e.reducedMotion} onChange={(reducedMotion) => set({ reducedMotion })} />
      </Row>
      <Row label="Forced colours" hint="Windows high-contrast mode">
        <Toggle checked={e.forcedColors} onChange={(forcedColors) => set({ forcedColors })} />
      </Row>
      <Row label="Reduced transparency">
        <Toggle checked={e.reducedTransparency} onChange={(reducedTransparency) => set({ reducedTransparency })} />
      </Row>
      <Row label="Print stylesheet">
        <Toggle checked={e.media === 'print'} onChange={(on) => set({ media: on ? 'print' : 'screen' })} />
      </Row>
      <Row label="Vision">
        <select className="select" value={e.vision} onChange={(ev) => set({ vision: ev.target.value as Emulation['vision'] })}>
          {VISION.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      <hr />
      <Row label="Network">
        <select className="select" value={e.network} onChange={(ev) => set({ network: ev.target.value as Emulation['network'] })}>
          <option value="online">No throttling</option>
          <option value="fast4g">Fast 4G</option>
          <option value="slow4g">Slow 4G</option>
          <option value="3g">3G</option>
          <option value="offline">Offline</option>
        </select>
      </Row>
      <Row label="CPU">
        <select className="select" value={e.cpu} onChange={(ev) => set({ cpu: Number(ev.target.value) })}>
          <option value={1}>No throttling</option>
          <option value={2}>2× slower</option>
          <option value={4}>4× slower (mid-range phone)</option>
          <option value={6}>6× slower (low-end phone)</option>
        </select>
      </Row>
      <Row label="Touch" hint="Pointer and hover media queries, touch APIs">
        <Segmented size="sm" value={e.touch} onChange={(touch) => set({ touch })} options={[{ value: 'auto', label: 'Per device' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Row>
      <Row label="Full-screen web app" hint="Content runs under the notch; env(safe-area-inset-*) reports the device's insets">
        <Toggle checked={e.standalone} onChange={(standalone) => set({ standalone })} />
      </Row>
      <Row label="Disable JavaScript">
        <Toggle checked={e.disableJs} onChange={(disableJs) => set({ disableJs })} />
      </Row>
      <Row label="Disable cache">
        <Toggle checked={e.disableCache} onChange={(disableCache) => set({ disableCache })} />
      </Row>
      <button type="button" className="link block" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Hide' : 'Show'} advanced
      </button>
      {advanced ? (
        <div className="stack">
          <label className="field">
            <span>User agent (blank uses each device's own)</span>
            <input className="input mono" value={e.userAgent} placeholder="Mozilla/5.0 …" onChange={(ev) => set({ userAgent: ev.target.value })} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Locale</span>
              <input className="input" value={e.locale} placeholder="en-US" onChange={(ev) => set({ locale: ev.target.value.trim() })} />
            </label>
            <label className="field">
              <span>Time zone</span>
              <input className="input" value={e.timezone} placeholder="Europe/Berlin" onChange={(ev) => set({ timezone: ev.target.value.trim() })} />
            </label>
          </div>
          <label className="field">
            <span>Geolocation (latitude, longitude)</span>
            <input
              className="input"
              defaultValue={geo}
              placeholder="48.8566, 2.3522"
              onBlur={(ev) => {
                const [latitude, longitude] = ev.target.value.split(',').map((n) => Number(n.trim()))
                set({ geolocation: Number.isFinite(latitude) && Number.isFinite(longitude) && ev.target.value.trim() ? { latitude, longitude, accuracy: 20 } : null })
              }}
            />
          </label>
          <label className="field">
            <span>Extra request headers (one per line)</span>
            <textarea className="input mono" rows={2} value={e.headers} placeholder="X-Preview: 1" onChange={(ev) => set({ headers: ev.target.value })} />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function OverlayPanel({ tab }: { tab: Tab }): ReactNode {
  const [query, setQuery] = useState('')
  const ws = useWorkspace.getState()
  const groups = ['Layout', 'Touch', 'Accessibility', 'Content'] as const
  const match = (text: string): boolean => text.toLowerCase().includes(query.toLowerCase())
  return (
    <div className="panel-pop">
      <div className="pop-head">
        <strong>Overlays</strong>
        {tab.overlays.length ? (
          <button type="button" className="link" onClick={() => ws.updateTab(tab.id, { overlays: [] })}>
            Clear {tab.overlays.length}
          </button>
        ) : null}
      </div>
      <div className="search">
        <Search size={13} />
        <input autoFocus placeholder="Filter overlays" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="overlay-list">
        {groups.map((group) => {
          const items = OVERLAYS.filter((o) => o.group === group && (match(o.name) || match(o.hint)))
          if (!items.length) return null
          return (
            <div key={group}>
              <h4>{group}</h4>
              {items.map((o) => (
                <label key={o.id} className="check-row" title={o.hint}>
                  <input type="checkbox" checked={tab.overlays.includes(o.id)} onChange={() => ws.toggleOverlay(tab.id, o.id)} />
                  <span>
                    {o.name}
                    <small>{o.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DevicesPanel({ tab, close }: { tab: Tab; close: () => void }): ReactNode {
  const ws = useWorkspace.getState()
  const suites = useWorkspace((s) => s.suites)
  const custom = useWorkspace((s) => s.customDevices)
  const [name, setName] = useState('')
  const current = tab.panes.map((p) => p.deviceId).join(',')
  return (
    <div className="panel-pop">
      <div className="pop-head">
        <strong>Devices</strong>
        <button
          type="button"
          className="link"
          onClick={() => {
            useRuntime.getState().set({ modal: 'devices' })
            close()
          }}
        >
          Manage…
        </button>
      </div>
      <div className="chip-wrap">
        {tab.panes.map((p) => {
          const device = deviceById(p.deviceId, custom)
          return (
            <span key={p.id} className="chip on">
              <DeviceIcon kind={device.kind} size={12} />
              {paneLabel(p, device)}
              {tab.panes.length > 1 ? (
                <button type="button" aria-label={`Remove ${device.name}`} onClick={() => ws.removePane(tab.id, p.id)}>
                  <X size={11} />
                </button>
              ) : null}
            </span>
          )
        })}
      </div>
      <h4>Suites</h4>
      <div className="menu">
        {allSuites(suites).map((suite) => (
          <MenuItem
            key={suite.id}
            icon={<MonitorSmartphone size={14} />}
            label={suite.name}
            hint={`${suite.deviceIds.length} devices`}
            checked={suite.deviceIds.join(',') === current}
            onClick={() => ws.setDevices(tab.id, suite.deviceIds)}
          />
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          ws.saveSuite(name.trim(), tab.panes.map((p) => p.deviceId))
          setName('')
        }}
      >
        <input className="input" placeholder="Save current set as…" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn" disabled={!name.trim()}>
          Save
        </button>
      </form>
      <h4>Breakpoints</h4>
      <div className="menu">
        <MenuItem icon={<Scaling size={14} />} label="Add a resizable pane" hint={<Kbd keys="Mod+Shift+N" />} onClick={() => void addResponsivePane(tab.id)} />
        {Object.entries(FRAMEWORK_BREAKPOINTS).map(([framework, widths]) => (
          <MenuItem
            key={framework}
            icon={<Columns3 size={14} />}
            label={`${framework} breakpoints`}
            hint={widths.join(' · ')}
            onClick={() => ws.updateTab(tab.id, { panes: widths.map((width) => ({ id: Math.random().toString(36).slice(2, 10), deviceId: 'responsive', rotated: false, width, height: 900 })) })}
          />
        ))}
      </div>
    </div>
  )
}

export function Toolbar({ tab }: { tab: Tab }): ReactNode {
  const settings = useWorkspace((s) => s.settings)
  const ws = useWorkspace.getState()
  const primary = useRuntime((s) => s.views[tab.panes[0]?.id])
  const loading = useRuntime((s) => tab.panes.some((p) => s.views[p.id]?.loading))
  const inspecting = useRuntime((s) => s.inspecting)
  const zoom = useRuntime((s) => s.effectiveZoom)
  const issueCount = useRuntime((s) => tab.panes.reduce((n, p) => n + (s.issues[p.id]?.filter((i) => i.severity !== 'info').length ?? 0), 0))
  const { sync } = settings
  const syncOn = sync.scroll || sync.click || sync.input || sync.nav
  const emulated = changedCount(tab.emulation)
  const scheme = tab.emulation.colorScheme

  return (
    <div className="toolbar">
      <div className="tool-group">
        <IconButton title="Back" disabled={!primary?.canGoBack} onClick={() => goHistory(tab.id, -1)}>
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton title="Forward" disabled={!primary?.canGoForward} onClick={() => goHistory(tab.id, 1)}>
          <ArrowRight size={15} />
        </IconButton>
        {loading ? (
          <IconButton title="Stop" onClick={() => stopLoading(tab.id)}>
            <X size={15} />
          </IconButton>
        ) : (
          <IconButton title="Reload all devices" disabled={!tab.url} onClick={(e) => reload(tab.id, e.shiftKey)}>
            <RotateCw size={14} />
          </IconButton>
        )}
      </div>

      <AddressBar tab={tab} />

      <div className="tool-group">
        <PopoverButton title="Devices and suites" icon={<MonitorSmartphone size={15} />} label={tab.panes.length} width={320} align="end" content={(close) => <DevicesPanel tab={tab} close={close} />} />
        <IconButton title="Rotate all devices" onClick={() => ws.rotateAll(tab.id)}>
          <RotateCcwSquare size={15} />
        </IconButton>
        <PopoverButton
          title="Mirror interactions across devices"
          icon={<Link2 size={15} />}
          active={syncOn}
          className={cx(!syncOn && 'off')}
          width={260}
          align="end"
          content={() => (
            <div className="panel-pop">
              <div className="pop-head">
                <strong>Mirroring</strong>
                <Toggle checked={syncOn} onChange={(on) => ws.setSettings({ sync: { scroll: on, click: on, input: on, nav: on } })} label="Mirror interactions" />
              </div>
              <p className="pop-note">What you do in one device is replayed in the others.</p>
              {(
                [
                  ['scroll', 'Scrolling', 'Matched by position, not pixels'],
                  ['click', 'Clicks', 'Skipped where the element is hidden'],
                  ['input', 'Typing and forms', ''],
                  ['nav', 'Navigation', 'Followers never drive, so redirects cannot loop']
                ] as const
              ).map(([key, label, hint]) => (
                <Row key={key} label={label} hint={hint}>
                  <Toggle checked={sync[key]} onChange={(on) => ws.setSettings({ sync: { ...sync, [key]: on } })} />
                </Row>
              ))}
            </div>
          )}
        />
      </div>

      <div className="tool-group">
        <IconButton
          title={`Colour scheme: ${scheme}. Click to switch`}
          active={scheme !== 'system'}
          onClick={() => ws.setEmulation(tab.id, { colorScheme: scheme === 'system' ? 'dark' : scheme === 'dark' ? 'light' : 'system' })}
        >
          {scheme === 'dark' ? <Moon size={15} /> : scheme === 'light' ? <Sun size={15} /> : <SunMoon size={15} />}
        </IconButton>
        <PopoverButton title="Emulation" icon={<SlidersHorizontal size={15} />} active={emulated > 0} badge={emulated || undefined} width={340} align="end" content={() => <EmulationPanel tab={tab} />} />
        <PopoverButton title="Debug overlays" icon={<Layers size={15} />} active={tab.overlays.length > 0} badge={tab.overlays.length || undefined} width={320} align="end" content={() => <OverlayPanel tab={tab} />} />
        <IconButton title="Simulate touch gestures with the mouse" active={settings.touchGestures} onClick={() => ws.setSettings({ touchGestures: !settings.touchGestures })}>
          <Hand size={15} />
        </IconButton>
        <IconButton title="Compare an element across devices" active={inspecting} onClick={() => setInspecting(tab.id, !inspecting)}>
          <Crosshair size={15} />
        </IconButton>
        <PopoverButton
          title="Screenshots"
          icon={<Camera size={15} />}
          width={270}
          align="end"
          content={(close) => (
            <div className="menu" role="menu" onClick={close}>
              <MenuItem icon={<Camera size={14} />} label="All devices" hint={<Kbd keys="Mod+Shift+S" />} onClick={() => void captureTab(tab.id)} />
              <MenuItem icon={<ScrollText size={14} />} label="All devices, full page" hint={<Kbd keys="Mod+Alt+S" />} onClick={() => void captureTab(tab.id, { fullPage: true })} />
              <MenuItem icon={<Sparkles size={14} />} label="Studio: one composite image" hint={<Kbd keys="Mod+Shift+P" />} onClick={() => void openStudio(tab.id)} />
              {tab.compareUrl ? <MenuItem icon={<Diff size={14} />} label="Pixel diff A against B, all devices" onClick={() => tab.panes.forEach((p) => void diffPane(p.id))} /> : null}
            </div>
          )}
        />
      </div>

      <div className="tool-group">
        <Segmented
          size="sm"
          value={settings.layout}
          onChange={(layout) => ws.setSettings({ layout })}
          options={[
            { value: 'row', label: <Columns3 size={14} />, title: 'Side by side' },
            { value: 'wrap', label: <LayoutGrid size={14} />, title: 'Wrap' },
            { value: 'focus', label: <Square size={14} />, title: 'One device at a time' }
          ]}
        />
        <IconButton title="Device frames" active={settings.showFrames} onClick={() => ws.setSettings({ showFrames: !settings.showFrames })}>
          <Frame size={15} />
        </IconButton>
        <div className="zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
            <Minus size={12} />
          </button>
          <button type="button" className={cx('zoom-value', settings.zoom === 'fit' && 'fit')} title="Click to fit" onClick={() => ws.setSettings({ zoom: settings.zoom === 'fit' ? 1 : 'fit' })}>
            {settings.zoom === 'fit' ? 'Fit' : ''} {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="tool-group">
        <IconButton title="AI agent access (MCP)" active={settings.mcpEnabled} onClick={() => useRuntime.getState().set({ modal: 'settings', settingsTab: 'agents' })}>
          <Bot size={15} />
        </IconButton>
        <IconButton title="Settings" onClick={() => useRuntime.getState().set({ modal: 'settings', settingsTab: 'general' })}>
          <SettingsIcon size={15} />
        </IconButton>
        <IconButton title="Audits and tools panel" active={settings.panelOpen} badge={issueCount || undefined} onClick={() => ws.setSettings({ panelOpen: !settings.panelOpen })}>
          <PanelRight size={15} />
        </IconButton>
      </div>
    </div>
  )
}
