import { Check, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BUILTIN_DEVICES, BUILTIN_SUITES, FRAMEWORK_BREAKPOINTS, KIND_LABELS, RESPONSIVE_ID } from '@shared/devices'
import type { DeviceKind } from '@shared/types'
import { IconButton, cx } from '@ui'
import { MAX_PANES, useStore } from '../store'
import { DeviceIcon } from './Pane'

const CATALOGUE = BUILTIN_DEVICES.filter((d) => d.id !== RESPONSIVE_ID)
const KINDS: DeviceKind[] = ['phone', 'foldable', 'tablet', 'laptop', 'desktop', 'tv', 'other', 'watch']

export function DeviceDrawer(): ReactNode {
  const panes = useStore((s) => s.panes)
  const suites = useStore((s) => s.suites)
  const store = useStore.getState()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<DeviceKind | 'all'>('all')
  const [size, setSize] = useState({ width: '', height: '' })
  const [suiteName, setSuiteName] = useState('')

  const open = new Set(panes.map((p) => p.deviceId))
  const full = panes.length >= MAX_PANES

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = CATALOGUE.filter((d) => {
      if (kind !== 'all' && d.kind !== kind) return false
      const haystack = `${d.name} ${d.brand} ${d.width}x${d.height} ${d.width} ${d.year ?? ''} ${KIND_LABELS[d.kind]}`.toLowerCase()
      return words.every((w) => haystack.includes(w))
    })
    const byGroup = new Map<string, typeof matches>()
    for (const device of matches) {
      const key = kind === 'all' ? `${KIND_LABELS[device.kind]} · ${device.brand}` : device.brand
      byGroup.set(key, [...(byGroup.get(key) ?? []), device])
    }
    return { total: matches.length, groups: [...byGroup.entries()] }
  }, [query, kind])

  const addSize = (): void => {
    const width = Math.min(5120, Math.max(160, Number(size.width) || 0))
    const height = Math.min(2880, Math.max(160, Number(size.height) || 800))
    if (!Number(size.width)) return
    store.addSize(width, height)
    setSize({ width: '', height: '' })
  }

  return (
    <aside className="drawer" aria-label="Devices">
      <header className="drawer-head">
        <strong>Devices</strong>
        <span className="dim">
          {panes.length} open of {CATALOGUE.length}
        </span>
        <IconButton size="sm" title="Close" className="right" onClick={() => store.set({ drawerOpen: false })}>
          <X size={14} />
        </IconButton>
      </header>

      <div className="drawer-section">
        <div className="search">
          <Search size={13} />
          <input placeholder="Search: iPhone 17, Galaxy, 1440, 2026…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search devices" />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          ) : null}
        </div>
        <div className="chip-wrap">
          <button type="button" className={cx('chip', kind === 'all' && 'on')} onClick={() => setKind('all')}>
            All
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={cx('chip', kind === k && 'on')} onClick={() => setKind(k)}>
              <DeviceIcon kind={k} size={12} />
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Presets</h4>
        <div className="chip-wrap">
          {[...BUILTIN_SUITES, ...suites].map((suite) => (
            <span key={suite.id} className="chip-group">
              <button type="button" className={cx('chip', suite.deviceIds.join() === panes.map((p) => p.deviceId).join() && 'on')} onClick={() => store.setDevices(suite.deviceIds)} title={`${suite.deviceIds.length} devices`}>
                {suite.name}
              </button>
              {suite.builtin ? null : (
                <button type="button" className="chip-x" aria-label={`Delete preset ${suite.name}`} onClick={() => store.deleteSuite(suite.id)}>
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!suiteName.trim()) return
            store.saveSuite(suiteName.trim())
            setSuiteName('')
          }}
        >
          <input className="input" placeholder="Save the open devices as…" value={suiteName} onChange={(e) => setSuiteName(e.target.value)} aria-label="Preset name" />
          <button type="submit" className="btn" disabled={!suiteName.trim()}>
            Save
          </button>
        </form>
      </div>

      <div className="drawer-section">
        <h4>Any size</h4>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            addSize()
          }}
        >
          <input className="input" type="number" min={160} max={5120} placeholder="Width" value={size.width} onChange={(e) => setSize({ ...size, width: e.target.value })} aria-label="Width in pixels" />
          <span className="dim">×</span>
          <input className="input" type="number" min={160} max={2880} placeholder="Height" value={size.height} onChange={(e) => setSize({ ...size, height: e.target.value })} aria-label="Height in pixels" />
          <button type="submit" className="btn" disabled={!Number(size.width) || full}>
            <Plus size={13} /> Add
          </button>
        </form>
        <div className="chip-wrap">
          {Object.entries(FRAMEWORK_BREAKPOINTS).map(([framework, widths]) => (
            <button
              key={framework}
              type="button"
              className="chip"
              title={`One resizable pane at each ${framework} breakpoint: ${widths.join(', ')}`}
              onClick={() => store.set({ panes: widths.map((width) => ({ id: Math.random().toString(36).slice(2, 10), deviceId: RESPONSIVE_ID, rotated: false, width, height: 900 })) })}
            >
              {framework} breakpoints
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-list">
        {full ? <p className="drawer-note">{MAX_PANES} devices is the most that can be open at once. Remove one to add another.</p> : null}
        {groups.total === 0 ? <p className="drawer-note">No device matches “{query}”. Use “Any size” above for an exact viewport.</p> : null}
        {groups.groups.map(([label, devices]) => (
          <section key={label}>
            <h4>
              {label}
              <span>{devices.length}</span>
            </h4>
            {devices.map((d) => {
              const on = open.has(d.id)
              return (
                <button key={d.id} type="button" className={cx('device-row', on && 'on')} aria-pressed={on} disabled={!on && full} onClick={() => store.toggleDevice(d.id)}>
                  <span className="device-row-check">{on ? <Check size={12} /> : <DeviceIcon kind={d.kind} size={12} />}</span>
                  <span className="device-row-name">{d.name}</span>
                  <span className="device-row-size" title={d.approx ? 'Estimated from the panel resolution' : undefined}>
                    {d.approx ? '≈' : ''}
                    {d.width}×{d.height}
                  </span>
                </button>
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}
