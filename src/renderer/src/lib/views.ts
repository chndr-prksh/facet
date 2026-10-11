/// <reference types="electron" />
import type { EmulationSpec, SyncEvent } from '@shared/types'
import { normalizeUrl, sameUrl } from '@shared/urls'
import { OVERLAYS, overlayRuntime } from '@/lib/overlays'
import { useRuntime, viewOf } from '@/store/runtime'
import { useWorkspace } from '@/store/workspace'

export type Side = 'a' | 'b'

export interface ViewRef {
  viewId: string
  paneId: string
  tabId: string
  side: Side
}

const webviews = new Map<string, Electron.WebviewTag>()
const refs = new Map<string, ViewRef>()
const specs = new Map<string, EmulationSpec>()

export const rememberSpec = (viewId: string, spec: EmulationSpec): void => void specs.set(viewId, spec)
export const lastSpec = (viewId: string): EmulationSpec | undefined => specs.get(viewId)

export const viewIdOf = (paneId: string, side: Side = 'a'): string => (side === 'a' ? paneId : `${paneId}~b`)

export function attachView(ref: ViewRef, webview: Electron.WebviewTag): void {
  webviews.set(ref.viewId, webview)
  refs.set(ref.viewId, ref)
}

export function detachView(viewId: string): void {
  webviews.delete(viewId)
  refs.delete(viewId)
  specs.delete(viewId)
  wanted.delete(viewId)
  applied.delete(viewId)
  programmaticUntil.delete(viewId)
}

/** The webview for a view, or undefined until its guest is ready for commands. */
export const getView = (viewId: string): Electron.WebviewTag | undefined => (viewOf(viewId).ready ? webviews.get(viewId) : undefined)

export const refOf = (viewId: string): ViewRef | undefined => refs.get(viewId)

/** Views of a tab in pane order, primary side first. */
export function viewsOfTab(tabId: string, side?: Side): ViewRef[] {
  const tab = useWorkspace.getState().tabs.find((t) => t.id === tabId)
  if (!tab) return []
  const out: ViewRef[] = []
  for (const pane of tab.panes) {
    for (const s of ['a', 'b'] as const) {
      const ref = refs.get(viewIdOf(pane.id, s))
      if (ref && (!side || side === s)) out.push(ref)
    }
  }
  return out
}

export const primaryViewId = (tabId: string): string | undefined => viewsOfTab(tabId, 'a')[0]?.viewId

/** Runs a self-contained function inside a pane and returns its result. */
export async function exec<A extends unknown[], R>(viewId: string, fn: (...args: A) => R, ...args: A): Promise<Awaited<R>> {
  const view = getView(viewId)
  if (!view) throw new Error('Pane is not ready')
  return view.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, false) as Promise<Awaited<R>>
}

export function sendToView(viewId: string, channel: string, payload?: unknown): void {
  try {
    getView(viewId)?.send(channel, payload)
  } catch {
    /* view went away */
  }
}

/* ---------- navigation ---------- */

// Views we told to navigate. Their navigations are consequences, not user
// intent, so they must not be mirrored back: that is how redirect loops start.
const programmaticUntil = new Map<string, number>()

const markProgrammatic = (viewId: string): void => void programmaticUntil.set(viewId, Date.now() + 8000)
const isProgrammatic = (viewId: string): boolean => (programmaticUntil.get(viewId) ?? 0) > Date.now()

/** Called when a view finishes loading: client-side redirects get a short grace period. */
export function settleView(viewId: string): void {
  if (programmaticUntil.has(viewId)) programmaticUntil.set(viewId, Date.now() + 600)
}

function load(viewId: string, url: string): void {
  const view = getView(viewId)
  if (!view) return
  markProgrammatic(viewId)
  view.loadURL(url).catch(() => {})
}

/** Same path on another origin, used to keep a comparison site in step. */
export function remapOrigin(url: string, onto: string): string {
  try {
    const from = new URL(url)
    const to = new URL(onto)
    if (!/^https?:$/.test(from.protocol) || !/^https?:$/.test(to.protocol)) return ''
    return to.origin + from.pathname + from.search + from.hash
  } catch {
    return ''
  }
}

export function navigate(tabId: string, input: string): void {
  const url = normalizeUrl(input)
  if (!url) return
  const ws = useWorkspace.getState()
  const tab = ws.tabs.find((t) => t.id === tabId)
  if (!tab) return
  const compareUrl = tab.compareUrl ? remapOrigin(url, tab.compareUrl) || tab.compareUrl : undefined
  ws.updateTab(tabId, { url, title: '', compareUrl })
  for (const ref of viewsOfTab(tabId)) load(ref.viewId, ref.side === 'a' ? url : (compareUrl ?? ''))
}

export function setCompare(tabId: string, input: string | null): void {
  const ws = useWorkspace.getState()
  const url = input ? normalizeUrl(input) : ''
  ws.updateTab(tabId, { compareUrl: url || undefined })
  useRuntime.getState().set({ diffs: {} })
  if (url) for (const ref of viewsOfTab(tabId, 'b')) load(ref.viewId, url)
}

export function reload(tabId: string, hard = false): void {
  for (const ref of viewsOfTab(tabId)) {
    const view = getView(ref.viewId)
    if (!view) continue
    markProgrammatic(ref.viewId)
    if (hard) view.reloadIgnoringCache()
    else view.reload()
  }
}

export function goHistory(tabId: string, direction: -1 | 1): void {
  for (const ref of viewsOfTab(tabId)) {
    const view = getView(ref.viewId)
    if (!view) continue
    if (direction < 0 ? view.canGoBack() : view.canGoForward()) {
      markProgrammatic(ref.viewId)
      if (direction < 0) view.goBack()
      else view.goForward()
    }
  }
}

export function stopLoading(tabId: string): void {
  for (const ref of viewsOfTab(tabId)) getView(ref.viewId)?.stop()
}

/** A view committed a navigation: update the address bar and bring siblings along. */
export function onNavigated(ref: ViewRef, url: string, inPage: boolean): void {
  if (!/^(https?|file):/i.test(url)) return
  const ws = useWorkspace.getState()
  const tab = ws.tabs.find((t) => t.id === ref.tabId)
  if (!tab) return
  const leads = useRuntime.getState().activeViewId === ref.viewId && !isProgrammatic(ref.viewId)
  const isPrimary = tab.panes[0]?.id === ref.paneId
  if (!leads && !isPrimary) return

  if (ref.side === 'a') {
    if (tab.url !== url) ws.updateTab(tab.id, { url })
    ws.pushHistory(url, viewOf(ref.viewId).title)
  } else if (tab.compareUrl !== url) ws.updateTab(tab.id, { compareUrl: url })

  if (!leads || !ws.settings.sync.nav) return
  // Mirrored clicks usually make siblings navigate on their own; only push
  // the URL to the ones that have not caught up after a moment.
  window.setTimeout(
    () => {
      for (const other of viewsOfTab(tab.id)) {
        if (other.viewId === ref.viewId) continue
        const view = getView(other.viewId)
        if (!view) continue
        const current = view.getURL()
        const target = other.side === ref.side ? url : remapOrigin(url, current)
        if (target && !sameUrl(current, target)) load(other.viewId, target)
      }
    },
    inPage ? 350 : 90
  )
}

/* ---------- interaction mirroring ---------- */

let syncPaused = false

/** Suspends mirroring while the app itself is driving the panes. */
export const pauseSync = (paused: boolean): void => void (syncPaused = paused)

export function broadcastSync(from: ViewRef, event: SyncEvent): void {
  if (syncPaused) return
  const ws = useWorkspace.getState()
  const { sync } = ws.settings
  const allowed = event.type === 'scroll' ? sync.scroll : event.type === 'click' || event.type === 'key' ? sync.click : sync.input
  if (!allowed) return
  const tab = ws.tabs.find((t) => t.id === from.tabId)
  if (!tab || tab.panes.find((p) => p.id === from.paneId)?.unsynced) return
  for (const other of viewsOfTab(from.tabId)) {
    if (other.viewId === from.viewId) continue
    if (tab.panes.find((p) => p.id === other.paneId)?.unsynced) continue
    sendToView(other.viewId, 'facet:sync', event)
  }
}

export function scrollAll(tabId: string, ratio: number): void {
  for (const ref of viewsOfTab(tabId)) sendToView(ref.viewId, 'facet:sync', { type: 'scroll', yr: ratio, xr: 0 } satisfies SyncEvent)
}

export function highlight(viewId: string, selector: string | undefined, opts: { scroll?: boolean; color?: string; hold?: boolean } = {}): void {
  sendToView(viewId, 'facet:highlight', { selector, ...opts })
}

/* ---------- overlays & injected CSS ---------- */

interface Applied {
  css: Map<string, string>
  scripts: Set<string>
  liveCssKey?: string
  liveCss?: string
}

const applied = new Map<string, Applied>()

const stateOf = (viewId: string): Applied => {
  let state = applied.get(viewId)
  if (!state) applied.set(viewId, (state = { css: new Map(), scripts: new Set() }))
  return state
}

/** A new document loaded in the view, so nothing injected earlier survives. */
export function resetInjected(viewId: string): void {
  applied.delete(viewId)
}

const wanted = new Map<string, { overlays: string[]; liveCss: string }>()
const syncing = new Set<string>()

/**
 * Brings a view's overlays and live CSS in line with the tab's settings.
 * Calls for the same view are collapsed: one runner applies the newest
 * request, so an update still in flight can never undo a later one.
 */
export async function syncInjected(viewId: string, overlayIds: string[], liveCss: string): Promise<void> {
  wanted.set(viewId, { overlays: overlayIds, liveCss })
  if (syncing.has(viewId)) return
  syncing.add(viewId)
  try {
    for (;;) {
      const target = wanted.get(viewId)
      if (!target) break
      await applyInjected(viewId, target.overlays, target.liveCss)
      if (wanted.get(viewId) === target) break
    }
  } finally {
    syncing.delete(viewId)
  }
}

async function applyInjected(viewId: string, overlayIds: string[], liveCss: string): Promise<void> {
  const view = getView(viewId)
  if (!view) return
  const state = stateOf(viewId)
  try {
    for (const def of OVERLAYS) {
      const want = overlayIds.includes(def.id)
      if (def.css) {
        const key = state.css.get(def.id)
        if (want && !key) state.css.set(def.id, await view.insertCSS(def.css))
        else if (!want && key) {
          state.css.delete(def.id)
          await view.removeInsertedCSS(key)
        }
      }
      if (def.script && want !== state.scripts.has(def.id)) {
        if (want) state.scripts.add(def.id)
        else state.scripts.delete(def.id)
        await exec(viewId, overlayRuntime, def.id, want)
      }
    }
    if (state.liveCss !== liveCss) {
      if (state.liveCssKey) await view.removeInsertedCSS(state.liveCssKey)
      state.liveCssKey = liveCss.trim() ? await view.insertCSS(liveCss) : undefined
      state.liveCss = liveCss
    }
  } catch {
    /* the page navigated mid-update; dom-ready will run this again */
  }
}

/** Swaps stylesheets in place so a CSS edit shows up without losing page state. */
export function refreshStyles(): void {
  const stamp = Date.now()
  document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]').forEach((link) => {
    const url = new URL(link.href)
    url.searchParams.set('_facet', String(stamp))
    link.href = url.href
  })
}
