import { create } from 'zustand'
import type { ConsoleEntry, ConsoleLevel, DeviceKind, Issue, MediaQueryInfo, PageMetrics, Vitals } from '@shared/types'
import type { A11yResult, ElementReport, OutlineData, PageMeta } from '@/lib/scripts'

export interface ViewRuntime {
  ready: boolean
  loading: boolean
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  error?: { code: number; description: string; url: string }
  vitals: Vitals
  metrics?: PageMetrics
  errors: number
  warnings: number
  emulationWarnings: string[]
}

const EMPTY_VIEW: ViewRuntime = {
  ready: false,
  loading: false,
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  vitals: {},
  errors: 0,
  warnings: 0,
  emulationWarnings: []
}

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
  action?: { label: string; run: () => void }
}

export type Modal = null | 'devices' | 'settings' | 'shortcuts' | 'studio' | 'palette'

export interface DesignOverlay {
  src: string
  opacity: number
  difference: boolean
}

export interface Shot {
  viewId: string
  name: string
  dataUrl: string
  width: number
  height: number
  dpr: number
  kind: DeviceKind
  radius: number
}

interface Runtime {
  views: Record<string, ViewRuntime>
  console: ConsoleEntry[]
  /** The view that last received real user input; it leads navigation. */
  activeViewId: string | null
  hoverUrl: string
  inspecting: boolean
  picked: { selector: string; viewId: string } | null
  modal: Modal
  toasts: Toast[]
  busy: string | null
  shots: Shot[]
  dragging: boolean
  designOverlays: Record<string, DesignOverlay>
  diffs: Record<string, { percent: number; dataUrl: string }>
  /** The zoom actually in use, which differs from the setting when it is 'fit'. */
  effectiveZoom: number
  settingsTab: 'general' | 'agents' | 'about'
  mcp: { running: boolean; port: number; url: string; error?: string } | null

  issues: Record<string, Issue[]>
  issuesAt: number
  a11y: Record<string, A11yResult>
  meta: PageMeta | null
  outline: OutlineData | null
  breakpoints: MediaQueryInfo[] | null
  elementReports: Record<string, ElementReport>

  patchView(id: string, patch: Partial<ViewRuntime>): void
  dropView(id: string): void
  log(entry: Omit<ConsoleEntry, 'id' | 'time'>): void
  clearConsole(tabId?: string): void
  toast(text: string, kind?: Toast['kind'], action?: Toast['action']): void
  dismissToast(id: number): void
  setDesign(paneId: string, overlay: DesignOverlay | null): void
  setDiff(paneId: string, diff: { percent: number; dataUrl: string } | null): void
  set(patch: Partial<Runtime>): void
}

let seq = 0

export const useRuntime = create<Runtime>((set, get) => ({
  views: {},
  console: [],
  activeViewId: null,
  hoverUrl: '',
  inspecting: false,
  picked: null,
  modal: null,
  toasts: [],
  busy: null,
  shots: [],
  dragging: false,
  designOverlays: {},
  diffs: {},
  effectiveZoom: 1,
  settingsTab: 'general',
  mcp: null,
  issues: {},
  issuesAt: 0,
  a11y: {},
  meta: null,
  outline: null,
  breakpoints: null,
  elementReports: {},

  patchView: (id, patch) => set((s) => ({ views: { ...s.views, [id]: { ...(s.views[id] ?? EMPTY_VIEW), ...patch } } })),
  dropView: (id) =>
    set((s) => {
      const { [id]: _gone, ...views } = s.views
      return { views }
    }),
  log: (entry) =>
    set((s) => {
      const view = s.views[entry.paneId] ?? EMPTY_VIEW
      const bump: Partial<ViewRuntime> =
        entry.level === 'error' || entry.level === 'network' ? { errors: view.errors + 1 } : entry.level === 'warn' ? { warnings: view.warnings + 1 } : {}
      return {
        console: [...s.console.slice(-799), { ...entry, id: ++seq, time: Date.now() }],
        views: { ...s.views, [entry.paneId]: { ...view, ...bump } }
      }
    }),
  clearConsole: (tabId) =>
    set((s) => ({
      console: tabId ? s.console.filter((e) => e.tabId !== tabId) : [],
      views: Object.fromEntries(Object.entries(s.views).map(([id, v]) => [id, { ...v, errors: 0, warnings: 0 }]))
    })),
  toast: (text, kind = 'info', action) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action }] }))
    window.setTimeout(() => get().dismissToast(id), action ? 7000 : 3600)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDesign: (paneId, overlay) =>
    set((s) => {
      const { [paneId]: _old, ...rest } = s.designOverlays
      return { designOverlays: overlay ? { ...rest, [paneId]: overlay } : rest }
    }),
  setDiff: (paneId, diff) =>
    set((s) => {
      const { [paneId]: _old, ...rest } = s.diffs
      return { diffs: diff ? { ...rest, [paneId]: diff } : rest }
    }),
  set: (patch) => set(patch)
}))

export const viewOf = (id: string): ViewRuntime => useRuntime.getState().views[id] ?? EMPTY_VIEW
export const useView = (id: string): ViewRuntime => useRuntime((s) => s.views[id] ?? EMPTY_VIEW)
export const toast = (text: string, kind?: Toast['kind'], action?: Toast['action']): void => useRuntime.getState().toast(text, kind, action)
export const levelOf = (n: number): ConsoleLevel => (n >= 3 ? 'error' : n === 2 ? 'warn' : n === 1 ? 'info' : 'log')
