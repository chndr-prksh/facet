import { create } from 'zustand'
import { BUILTIN_DEVICES, BUILTIN_SUITES, RESPONSIVE_ID, userAgentFor } from '@shared/devices'
import {
  DEFAULT_EMULATION,
  type Bookmark,
  type Device,
  type Emulation,
  type EmulationSpec,
  type Insets,
  type Pane,
  type PersistedState,
  type Settings,
  type Snippet,
  type Suite,
  type Tab
} from '@shared/types'
import { bridge, type AppInfo } from '@/lib/bridge'

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  layout: 'row',
  zoom: 'fit',
  showFrames: false,
  stageBg: 'dots',
  sync: { scroll: true, click: true, input: true, nav: true },
  homepage: '',
  screenshotDir: '',
  popups: 'same',
  mcpEnabled: false,
  mcpPort: 12790,
  panelOpen: false,
  panelWidth: 400,
  panelTab: 'issues',
  ignoreCertErrors: false,
  touchGestures: false
}

const panesFor = (deviceIds: string[]): Pane[] => deviceIds.map((deviceId) => ({ id: uid(), deviceId, rotated: false }))

const makeTab = (url = '', deviceIds = BUILTIN_SUITES[0].deviceIds): Tab => ({
  id: uid(),
  url,
  title: '',
  panes: panesFor(deviceIds),
  emulation: { ...DEFAULT_EMULATION },
  overlays: [],
  liveCss: ''
})

interface Workspace extends PersistedState {
  hydrated: boolean
  info: AppInfo | null

  hydrate(): Promise<void>
  addTab(url?: string): string
  closeTab(id: string): void
  setActiveTab(id: string): void
  updateTab(id: string, patch: Partial<Tab>): void

  addPane(tabId: string, deviceId: string, extra?: Partial<Pane>): string
  removePane(tabId: string, paneId: string): void
  updatePane(tabId: string, paneId: string, patch: Partial<Pane>): void
  movePane(tabId: string, paneId: string, delta: number): void
  setDevices(tabId: string, deviceIds: string[]): void
  rotateAll(tabId: string): void

  setEmulation(tabId: string, patch: Partial<Emulation>): void
  setPaneOverride(tabId: string, paneId: string, patch: Partial<Emulation> | null): void
  toggleOverlay(tabId: string, overlayId: string): void

  saveSuite(name: string, deviceIds: string[]): void
  deleteSuite(id: string): void
  upsertDevice(device: Device): void
  deleteDevice(id: string): void

  toggleBookmark(url: string, title: string): void
  pushHistory(url: string, title: string): void
  upsertSnippet(snippet: Snippet): void
  deleteSnippet(id: string): void
  setSettings(patch: Partial<Settings>): void
}

const mapTab = (tabs: Tab[], id: string, fn: (tab: Tab) => Tab): Tab[] => tabs.map((t) => (t.id === id ? fn(t) : t))

const first = makeTab()

export const useWorkspace = create<Workspace>((set, get) => ({
  version: 1,
  tabs: [first],
  activeTabId: first.id,
  suites: [],
  customDevices: [],
  bookmarks: [],
  history: [],
  snippets: [],
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  info: null,

  async hydrate() {
    const [raw, info] = await Promise.all([bridge.loadState(), bridge.info()])
    const saved = (raw ?? {}) as Partial<PersistedState>
    const known = new Set([...BUILTIN_DEVICES, ...(saved.customDevices ?? [])].map((d) => d.id))
    // Drop panes whose device no longer exists, and never start with an empty workspace.
    const tabs = (saved.tabs ?? [])
      .map((t) => ({
        ...makeTab(),
        ...t,
        emulation: { ...DEFAULT_EMULATION, ...t.emulation },
        panes: (t.panes ?? []).filter((p) => known.has(p.deviceId))
      }))
      .filter((t) => t.panes.length > 0)
    const settings: Settings = { ...DEFAULT_SETTINGS, ...saved.settings, sync: { ...DEFAULT_SETTINGS.sync, ...saved.settings?.sync } }
    const finalTabs = tabs.length ? tabs : [makeTab(settings.homepage)]
    set({
      tabs: finalTabs,
      activeTabId: finalTabs.some((t) => t.id === saved.activeTabId) ? saved.activeTabId! : finalTabs[0].id,
      suites: saved.suites ?? [],
      customDevices: saved.customDevices ?? [],
      bookmarks: saved.bookmarks ?? [],
      history: saved.history ?? [],
      snippets: saved.snippets ?? [],
      settings,
      info,
      hydrated: true
    })
  },

  addTab(url) {
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    const tab = makeTab(url ?? get().settings.homepage, active?.panes.map((p) => p.deviceId))
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    return tab.id
  },
  closeTab(id) {
    set((s) => {
      if (s.tabs.length === 1) {
        const tab = makeTab(s.settings.homepage)
        return { tabs: [tab], activeTabId: tab.id }
      }
      const index = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      return { tabs, activeTabId: s.activeTabId === id ? tabs[Math.max(0, index - 1)].id : s.activeTabId }
    })
  },
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, patch) => set((s) => ({ tabs: mapTab(s.tabs, id, (t) => ({ ...t, ...patch })) })),

  addPane(tabId, deviceId, extra) {
    const pane: Pane = { id: uid(), deviceId, rotated: false, ...extra }
    set((s) => ({ tabs: mapTab(s.tabs, tabId, (t) => ({ ...t, panes: [...t.panes, pane] })) }))
    return pane.id
  },
  removePane: (tabId, paneId) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => (t.panes.length > 1 ? { ...t, panes: t.panes.filter((p) => p.id !== paneId) } : t))
    })),
  updatePane: (tabId, paneId, patch) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => ({ ...t, panes: t.panes.map((p) => (p.id === paneId ? { ...p, ...patch } : p)) }))
    })),
  movePane: (tabId, paneId, delta) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => {
        const from = t.panes.findIndex((p) => p.id === paneId)
        const to = from + delta
        if (from < 0 || to < 0 || to >= t.panes.length) return t
        const panes = [...t.panes]
        panes.splice(to, 0, panes.splice(from, 1)[0])
        return { ...t, panes }
      })
    })),
  setDevices: (tabId, deviceIds) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => {
        // Keep existing panes (and their loaded pages) where the device is unchanged.
        const pool = [...t.panes]
        const panes = deviceIds.map((deviceId) => {
          const i = pool.findIndex((p) => p.deviceId === deviceId)
          return i >= 0 ? pool.splice(i, 1)[0] : { id: uid(), deviceId, rotated: false }
        })
        return panes.length ? { ...t, panes } : t
      })
    })),
  rotateAll: (tabId) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => {
        const all = [...BUILTIN_DEVICES, ...s.customDevices]
        const rotatable = (p: Pane): boolean => !!all.find((d) => d.id === p.deviceId)?.mobile
        const target = !t.panes.filter(rotatable).every((p) => p.rotated)
        return { ...t, panes: t.panes.map((p) => (rotatable(p) ? { ...p, rotated: target } : p)) }
      })
    })),

  setEmulation: (tabId, patch) =>
    set((s) => ({ tabs: mapTab(s.tabs, tabId, (t) => ({ ...t, emulation: { ...t.emulation, ...patch } })) })),
  setPaneOverride: (tabId, paneId, patch) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => ({
        ...t,
        panes: t.panes.map((p) => (p.id === paneId ? { ...p, overrides: patch === null ? undefined : { ...p.overrides, ...patch } } : p))
      }))
    })),
  toggleOverlay: (tabId, overlayId) =>
    set((s) => ({
      tabs: mapTab(s.tabs, tabId, (t) => ({
        ...t,
        overlays: t.overlays.includes(overlayId) ? t.overlays.filter((o) => o !== overlayId) : [...t.overlays, overlayId]
      }))
    })),

  saveSuite: (name, deviceIds) =>
    set((s) => {
      const existing = s.suites.find((x) => x.name.toLowerCase() === name.toLowerCase())
      const suite: Suite = { id: existing?.id ?? uid(), name, deviceIds }
      return { suites: existing ? s.suites.map((x) => (x.id === suite.id ? suite : x)) : [...s.suites, suite] }
    }),
  deleteSuite: (id) => set((s) => ({ suites: s.suites.filter((x) => x.id !== id) })),
  upsertDevice: (device) =>
    set((s) => ({
      customDevices: s.customDevices.some((d) => d.id === device.id)
        ? s.customDevices.map((d) => (d.id === device.id ? device : d))
        : [...s.customDevices, device]
    })),
  deleteDevice: (id) =>
    set((s) => ({
      customDevices: s.customDevices.filter((d) => d.id !== id),
      suites: s.suites.map((x) => ({ ...x, deviceIds: x.deviceIds.filter((d) => d !== id) })),
      tabs: s.tabs.map((t) => {
        const panes = t.panes.filter((p) => p.deviceId !== id)
        return { ...t, panes: panes.length ? panes : panesFor([BUILTIN_SUITES[0].deviceIds[0]]) }
      })
    })),

  toggleBookmark: (url, title) =>
    set((s) => ({
      bookmarks: s.bookmarks.some((b) => b.url === url) ? s.bookmarks.filter((b) => b.url !== url) : [...s.bookmarks, { url, title: title || url }]
    })),
  pushHistory: (url, title) =>
    set((s) => {
      if (!/^(https?|file):/i.test(url)) return s
      const entry: Bookmark = { url, title: title || s.history.find((h) => h.url === url)?.title || '' }
      return { history: [entry, ...s.history.filter((h) => h.url !== url)].slice(0, 200) }
    }),
  upsertSnippet: (snippet) =>
    set((s) => ({
      snippets: s.snippets.some((x) => x.id === snippet.id) ? s.snippets.map((x) => (x.id === snippet.id ? snippet : x)) : [...s.snippets, snippet]
    })),
  deleteSnippet: (id) => set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } }))
}))

/* ---------- persistence ---------- */

let saveTimer = 0
useWorkspace.subscribe((s) => {
  if (!s.hydrated) return
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const { version, tabs, activeTabId, suites, customDevices, bookmarks, history, snippets, settings } = useWorkspace.getState()
    void bridge.saveState({ version, tabs, activeTabId, suites, customDevices, bookmarks, history, snippets, settings } satisfies PersistedState)
  }, 400)
})

/* ---------- selectors & derivations ---------- */

export const useActiveTab = (): Tab => useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0])

export const activeTab = (): Tab => {
  const s = useWorkspace.getState()
  return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]
}

export const allDevices = (custom: Device[] = useWorkspace.getState().customDevices): Device[] => [...BUILTIN_DEVICES, ...custom]

export const deviceById = (id: string, custom?: Device[]): Device =>
  allDevices(custom).find((d) => d.id === id) ?? BUILTIN_DEVICES.find((d) => d.id === RESPONSIVE_ID)!

export const allSuites = (suites: Suite[] = useWorkspace.getState().suites): Suite[] => [...BUILTIN_SUITES, ...suites]

export function paneSize(pane: Pane, device: Device): { width: number; height: number } {
  const width = device.kind === 'responsive' ? (pane.width ?? device.width) : device.width
  const height = device.kind === 'responsive' ? (pane.height ?? device.height) : device.height
  return pane.rotated ? { width: height, height: width } : { width, height }
}

export const paneLabel = (pane: Pane, device: Device): string => {
  const { width, height } = paneSize(pane, device)
  return device.kind === 'responsive' ? `${width} × ${height}` : device.name
}

export const effectiveEmulation = (tab: Tab, pane: Pane): Emulation => ({ ...tab.emulation, ...pane.overrides })

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/** Everything the main process needs to emulate a device in one pane. */
export function resolveSpec(tab: Tab, pane: Pane, device: Device, chromeVersion: string): EmulationSpec {
  const emu = effectiveEmulation(tab, pane)
  const { width, height } = paneSize(pane, device)
  const { touch: touchMode, userAgent: uaOverride, ...rest } = emu
  const inset = device.safeArea ?? ZERO
  // Rotating a phone moves the notch inset to the leading edge.
  const safeArea = pane.rotated ? { top: 0, right: inset.top, bottom: inset.bottom ? 21 : 0, left: inset.top } : inset
  return {
    ...rest,
    width,
    height,
    dpr: device.dpr,
    mobile: device.mobile,
    touch: touchMode === 'auto' ? device.touch : touchMode === 'on',
    landscape: width > height,
    os: device.os,
    userAgent: uaOverride || device.userAgent || userAgentFor(device.os, device.kind !== 'tablet', chromeVersion),
    // A browser keeps the status bar outside the page, so insets are zero
    // unless the page is being tested as an installed, full-screen app.
    safeArea: device.mobile && emu.standalone ? safeArea : ZERO
  }
}

export const partitionFor = (pane: Pane): string => (pane.isolated ? `persist:facet-${pane.id}` : 'persist:facet')
