import { create } from 'zustand'
import { BUILTIN_DEVICES, BUILTIN_SUITES, RESPONSIVE_ID } from '@shared/devices'
import type { Device, Suite } from '@shared/types'

export interface WebPane {
  id: string
  deviceId: string
  rotated: boolean
  /** Free-form size, used when the device is the resizable one. */
  width?: number
  height?: number
}

export type Layout = 'row' | 'wrap' | 'focus'
export type Overlay = 'none' | 'grid' | 'thumb'

interface Persisted {
  url: string
  compareUrl: string
  panes: WebPane[]
  layout: Layout
  zoom: number | 'fit'
  frames: boolean
  theme: 'dark' | 'light'
  overlay: Overlay
  recent: string[]
  suites: Suite[]
  drawerOpen: boolean
  mirror: boolean
  bannerDismissed: string[]
}

interface State extends Persisted {
  focusId: string | null
  /** Bumped to force every frame to reload. */
  reloadKey: number
  helperVersion: string | null
  /** URL each pane last reported through the helper. */
  frameUrls: Record<string, string>
  overflow: Record<string, number>
  help: boolean
  /** The zoom in use, which differs from the setting when it is 'fit'. */
  effectiveZoom: number
  /** Whether the open page (and the comparison page) can be shown in a frame. */
  embed: Record<string, 'checking' | 'ok' | 'blocked' | 'unknown'>

  open(input: string): void
  setCompare(input: string): void
  toggleDevice(deviceId: string): void
  setDevices(deviceIds: string[]): void
  addSize(width: number, height: number): void
  updatePane(id: string, patch: Partial<WebPane>): void
  removePane(id: string): void
  movePane(id: string, delta: number): void
  rotateAll(): void
  saveSuite(name: string): void
  deleteSuite(id: string): void
  set(patch: Partial<State>): void
}

export const uid = (): string => Math.random().toString(36).slice(2, 10)

/** Every pane is a live page; past this many, browsers start to struggle. */
export const MAX_PANES = 24

export const REPO_URL = 'https://github.com/chndr-prksh/facet'

/** Whether this build ships the helper extension download. */
export const HELPER_AVAILABLE = true

const DEVICES = new Map(BUILTIN_DEVICES.map((d) => [d.id, d]))

export const deviceOf = (id: string): Device => DEVICES.get(id) ?? DEVICES.get(RESPONSIVE_ID)!

export function paneSize(pane: WebPane): { width: number; height: number } {
  const device = deviceOf(pane.deviceId)
  const free = device.kind === 'responsive'
  const width = free ? (pane.width ?? device.width) : device.width
  const height = free ? (pane.height ?? device.height) : device.height
  return pane.rotated ? { width: height, height: width } : { width, height }
}

export const paneName = (pane: WebPane): string => {
  const device = deviceOf(pane.deviceId)
  const { width, height } = paneSize(pane)
  return device.kind === 'responsive' ? `${width} × ${height}` : device.name
}

const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w-]+\.(localhost|local|test))(:\d+)?(\/|$|\?|#)/i

/**
 * Turns pasted text into something an iframe can load. An https page cannot
 * frame plain http, so remote http is upgraded; loopback is the exception
 * browsers allow.
 */
export function toFrameUrl(input: string): string {
  let raw = input.trim()
  if (!raw) return ''
  if (/^(javascript|data|blob|file|about|vbscript):/i.test(raw)) return ''
  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith(':')) raw = `localhost${raw}`
    raw = `${LOCAL.test(raw) ? 'http' : 'https'}://${raw}`
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (!url.hostname.includes('.') && !/^(localhost|\[::1\])$/i.test(url.hostname)) return ''
  const local = LOCAL.test(url.host + '/')
  if (url.protocol === 'http:' && !local && location.protocol === 'https:') url.protocol = 'https:'
  return url.href
}

const STORAGE_KEY = 'facet-web/v1'

const DEFAULTS: Persisted = {
  url: '',
  compareUrl: '',
  panes: BUILTIN_SUITES[0].deviceIds.map((deviceId) => ({ id: uid(), deviceId, rotated: false })),
  layout: 'row',
  zoom: 'fit',
  frames: true,
  theme: 'dark',
  overlay: 'none',
  recent: [],
  suites: [],
  drawerOpen: false,
  mirror: true,
  bannerDismissed: []
}

function load(): Persisted {
  let saved: Partial<Persisted> = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  const state = { ...DEFAULTS, ...saved }
  state.panes = (state.panes ?? []).filter((p) => DEVICES.has(p.deviceId))
  if (!state.panes.length) state.panes = DEFAULTS.panes

  // A shared link carries its own page and devices, and wins over saved state.
  const params = new URLSearchParams(location.search)
  const sharedUrl = toFrameUrl(params.get('url') ?? '')
  if (sharedUrl) state.url = sharedUrl
  const shared = (params.get('devices') ?? '')
    .split(',')
    .map((token): WebPane | null => {
      const size = /^(\d{2,4})x(\d{2,4})$/.exec(token)
      if (size) return { id: uid(), deviceId: RESPONSIVE_ID, rotated: false, width: Number(size[1]), height: Number(size[2]) }
      const landscape = token.endsWith('~')
      const id = landscape ? token.slice(0, -1) : token
      return DEVICES.has(id) && id !== RESPONSIVE_ID ? { id: uid(), deviceId: id, rotated: landscape } : null
    })
    .filter((p): p is WebPane => p !== null)
  if (shared.length) state.panes = shared.slice(0, MAX_PANES)
  return state
}

export const useStore = create<State>((set, get) => ({
  ...load(),
  focusId: null,
  reloadKey: 0,
  helperVersion: null,
  frameUrls: {},
  overflow: {},
  help: false,
  effectiveZoom: 1,
  embed: {},

  open(input) {
    const url = toFrameUrl(input)
    if (!url) return
    set((s) => ({ url, frameUrls: {}, overflow: {}, recent: [url, ...s.recent.filter((r) => r !== url)].slice(0, 12) }))
  },
  setCompare: (input) => set({ compareUrl: toFrameUrl(input) }),

  toggleDevice(deviceId) {
    const { panes } = get()
    const existing = panes.find((p) => p.deviceId === deviceId)
    if (existing) {
      if (panes.length > 1) set({ panes: panes.filter((p) => p.id !== existing.id) })
    } else if (panes.length < MAX_PANES) set({ panes: [...panes, { id: uid(), deviceId, rotated: false }] })
  },
  setDevices(deviceIds) {
    // Keep panes whose device is unchanged so their pages are not reloaded.
    const pool = [...get().panes]
    const panes = deviceIds
      .filter((id) => DEVICES.has(id))
      .slice(0, MAX_PANES)
      .map((deviceId) => {
        const i = pool.findIndex((p) => p.deviceId === deviceId)
        return i >= 0 ? pool.splice(i, 1)[0] : { id: uid(), deviceId, rotated: false }
      })
    if (panes.length) set({ panes })
  },
  addSize: (width, height) => set((s) => (s.panes.length < MAX_PANES ? { panes: [...s.panes, { id: uid(), deviceId: RESPONSIVE_ID, rotated: false, width, height }] } : s)),
  updatePane: (id, patch) => set((s) => ({ panes: s.panes.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePane: (id) => set((s) => (s.panes.length > 1 ? { panes: s.panes.filter((p) => p.id !== id) } : s)),
  movePane: (id, delta) =>
    set((s) => {
      const from = s.panes.findIndex((p) => p.id === id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= s.panes.length) return s
      const panes = [...s.panes]
      panes.splice(to, 0, panes.splice(from, 1)[0])
      return { panes }
    }),
  rotateAll: () =>
    set((s) => {
      const rotatable = (p: WebPane): boolean => deviceOf(p.deviceId).mobile
      const target = !s.panes.filter(rotatable).every((p) => p.rotated)
      return { panes: s.panes.map((p) => (rotatable(p) ? { ...p, rotated: target } : p)) }
    }),
  saveSuite: (name) =>
    set((s) => ({
      suites: [...s.suites.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { id: uid(), name, deviceIds: s.panes.map((p) => p.deviceId).filter((id) => id !== RESPONSIVE_ID) }]
    })),
  deleteSuite: (id) => set((s) => ({ suites: s.suites.filter((x) => x.id !== id) })),
  set: (patch) => set(patch)
}))

useStore.subscribe((s) => {
  const { url, compareUrl, panes, layout, zoom, frames, theme, overlay, recent, suites, drawerOpen, mirror, bannerDismissed } = s
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, compareUrl, panes, layout, zoom, frames, theme, overlay, recent, suites, drawerOpen, mirror, bannerDismissed } satisfies Persisted))
  } catch {
    /* storage full or blocked: the session still works */
  }
})

/** A link that reopens this page and these devices for someone else. */
export function shareLink(): string {
  const { url, panes } = useStore.getState()
  const devices = panes.map((p) => {
    if (p.deviceId === RESPONSIVE_ID) {
      const { width, height } = paneSize(p)
      return `${width}x${height}`
    }
    return p.deviceId + (p.rotated ? '~' : '')
  })
  const link = new URL(location.origin + location.pathname)
  if (url) link.searchParams.set('url', url)
  link.searchParams.set('devices', devices.join(','))
  return link.href
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
