import axeSource from 'axe-core/axe.min.js?raw'
import { RESPONSIVE_ID } from '@shared/devices'
import type { Issue, Pane, Tab } from '@shared/types'
import { hostOf } from '@shared/urls'
import { bridge } from '@/lib/bridge'
import { auditPage, extractMeta, extractOutline, measureElement, runAxe, type A11yResult, type ElementReport } from '@/lib/scripts'
import { exec, getView, pauseSync, primaryViewId, refOf, sendToView, viewIdOf, viewsOfTab, type ViewRef } from '@/lib/views'
import { toast, useRuntime, type Shot } from '@/store/runtime'
import { allDevices, deviceById, paneSize, useWorkspace } from '@/store/workspace'

const tabOf = (tabId: string): Tab | undefined => useWorkspace.getState().tabs.find((t) => t.id === tabId)
const paneOf = (ref: ViewRef): Pane | undefined => tabOf(ref.tabId)?.panes.find((p) => p.id === ref.paneId)

/** Human name for a view, unique within its tab: "iPhone 17", "iPhone 17 (2)", "iPad landscape · B". */
export function viewName(ref: ViewRef): string {
  const tab = tabOf(ref.tabId)
  const pane = paneOf(ref)
  if (!tab || !pane) return ref.viewId
  const base = (p: Pane): string => {
    const d = deviceById(p.deviceId)
    const { width, height } = paneSize(p, d)
    return d.kind === 'responsive' ? `${width}×${height}` : `${d.name}${p.rotated ? ' landscape' : ''}`
  }
  const mine = base(pane)
  const twins = tab.panes.filter((p) => base(p) === mine)
  const index = twins.length > 1 ? ` (${twins.indexOf(pane) + 1})` : ''
  return `${mine}${index}${ref.side === 'b' ? ' · B' : ''}`
}

/* ---------- screenshots ---------- */

export async function captureTab(tabId: string, opts: { fullPage?: boolean; paneId?: string; save?: boolean } = {}): Promise<Shot[]> {
  const rt = useRuntime.getState()
  const refs = viewsOfTab(tabId).filter((r) => !opts.paneId || r.paneId === opts.paneId)
  if (!refs.length) return []
  rt.set({ busy: opts.fullPage ? 'Capturing full pages…' : 'Capturing…' })
  // Element highlights are ours, not the page's; keep them out of the picture.
  for (const ref of refs) sendToView(ref.viewId, 'facet:highlight', {})
  await new Promise((resolve) => setTimeout(resolve, 60))
  // A full-page capture scrolls each pane itself; that must not be mirrored.
  pauseSync(true)
  try {
    const shots = (
      await Promise.all(
        refs.map(async (ref): Promise<Shot | null> => {
          const pane = paneOf(ref)
          if (!pane || !getView(ref.viewId)) return null
          try {
            const result = await bridge.capture(ref.viewId, !!opts.fullPage)
            if (result.truncated) toast(`${viewName(ref)} is very tall; the capture was cut short`, 'info')
            const device = deviceById(pane.deviceId)
            return { viewId: ref.viewId, name: viewName(ref), dataUrl: result.dataUrl, width: result.width, height: result.height, dpr: result.scale, kind: device.kind, radius: device.radius ?? 0 }
          } catch {
            return null
          }
        })
      )
    ).filter((s): s is Shot => s !== null)

    if (opts.save !== false && shots.length) {
      const ws = useWorkspace.getState()
      const site = hostOf(tabOf(tabId)?.url ?? '')
      const paths = await bridge.saveShots(
        shots.map((s) => ({ name: s.name + (opts.fullPage ? ' full' : ''), dataUrl: s.dataUrl })),
        site,
        ws.settings.screenshotDir
      )
      toast(shots.length === 1 ? 'Screenshot saved' : `${shots.length} screenshots saved`, 'success', { label: 'Show in folder', run: () => void bridge.reveal(paths[0]) })
    }
    return shots
  } finally {
    pauseSync(false)
    rt.set({ busy: null })
  }
}

export async function openStudio(tabId: string): Promise<void> {
  const shots = await captureTab(tabId, { save: false })
  if (shots.length) useRuntime.getState().set({ shots, modal: 'studio' })
}

/** Downscaled JPEG for agents, so a screenshot does not cost a fortune in tokens. */
export function toJpeg(dataUrl: string, maxWidth = 1000, maxHeight = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
    }
    img.onerror = () => reject(new Error('Could not decode screenshot'))
    img.src = dataUrl
  })
}

/* ---------- audits ---------- */

export async function runIssues(tabId: string): Promise<Record<string, Issue[]>> {
  const results: Record<string, Issue[]> = {}
  await Promise.all(
    viewsOfTab(tabId, 'a').map(async (ref) => {
      const pane = paneOf(ref)
      if (!pane) return
      const device = deviceById(pane.deviceId)
      try {
        results[ref.viewId] = await exec(ref.viewId, auditPage, {
          touch: device.touch,
          ios: device.os === 'ios' || device.os === 'ipados',
          mobile: device.mobile,
          dpr: device.dpr
        })
      } catch {
        /* pane not loaded */
      }
    })
  )
  useRuntime.getState().set({ issues: results, issuesAt: Date.now() })
  return results
}

export async function runA11y(tabId: string, viewId = primaryViewId(tabId)): Promise<A11yResult | null> {
  if (!viewId) return null
  const view = getView(viewId)
  if (!view) return null
  let result: A11yResult
  try {
    if (!(await view.executeJavaScript('typeof window.axe !== "undefined"'))) await view.executeJavaScript(`${axeSource};void 0`)
    result = { ...(await exec(viewId, runAxe)), ranAt: Date.now() }
  } catch (err) {
    result = { violations: [], passes: 0, incomplete: 0, ranAt: Date.now(), error: (err as Error).message }
  }
  useRuntime.getState().set({ a11y: { ...useRuntime.getState().a11y, [viewId]: result } })
  return result
}

export async function loadMeta(tabId: string): Promise<void> {
  const viewId = primaryViewId(tabId)
  if (!viewId) return
  try {
    useRuntime.getState().set({ meta: await exec(viewId, extractMeta) })
  } catch {
    useRuntime.getState().set({ meta: null })
  }
}

export async function loadOutline(tabId: string): Promise<void> {
  const viewId = primaryViewId(tabId)
  if (!viewId) return
  try {
    useRuntime.getState().set({ outline: await exec(viewId, extractOutline) })
  } catch {
    useRuntime.getState().set({ outline: null })
  }
}

export async function loadBreakpoints(tabId: string): Promise<void> {
  // Breakpoints come from the stylesheets, so the widest pane sees the same set as any other.
  const viewId = primaryViewId(tabId)
  if (!viewId) return
  try {
    useRuntime.getState().set({ breakpoints: await bridge.mediaQueries(viewId) })
  } catch {
    useRuntime.getState().set({ breakpoints: [] })
  }
}

export async function measureEverywhere(tabId: string, selector: string): Promise<Record<string, ElementReport>> {
  const reports: Record<string, ElementReport> = {}
  await Promise.all(
    viewsOfTab(tabId).map(async (ref) => {
      try {
        reports[ref.viewId] = await exec(ref.viewId, measureElement, selector)
        sendToView(ref.viewId, 'facet:highlight', { selector, hold: true })
      } catch {
        /* pane not loaded */
      }
    })
  )
  useRuntime.getState().set({ elementReports: reports })
  return reports
}

export async function runAllAudits(tabId: string): Promise<void> {
  const rt = useRuntime.getState()
  rt.set({ busy: 'Auditing…' })
  try {
    await Promise.all([runIssues(tabId), runA11y(tabId), loadMeta(tabId), loadOutline(tabId), loadBreakpoints(tabId)])
  } finally {
    rt.set({ busy: null })
  }
}

/* ---------- element picker ---------- */

export function setInspecting(tabId: string, on: boolean): void {
  useRuntime.getState().set({ inspecting: on })
  for (const ref of viewsOfTab(tabId)) {
    sendToView(ref.viewId, 'facet:inspect', on)
    if (!on) sendToView(ref.viewId, 'facet:highlight', {})
  }
}

export function pickElement(tabId: string, viewId: string, selector: string): void {
  setInspecting(tabId, false)
  const ws = useWorkspace.getState()
  useRuntime.getState().set({ picked: { selector, viewId } })
  ws.setSettings({ panelOpen: true, panelTab: 'inspect' })
  void measureEverywhere(tabId, selector)
}

/* ---------- devices ---------- */

export function addResponsivePane(tabId: string, width = 480, height = 800): string {
  return useWorkspace.getState().addPane(tabId, RESPONSIVE_ID, { width: Math.round(width), height: Math.round(height) })
}

/** Resolves agent- or user-supplied device names: an id, a name, or "WIDTHxHEIGHT". */
export function resolveDeviceToken(token: string): { deviceId: string; width?: number; height?: number } | null {
  const size = /^(\d{2,4})\s*[x×]\s*(\d{2,4})$/i.exec(token.trim())
  if (size) return { deviceId: RESPONSIVE_ID, width: Number(size[1]), height: Number(size[2]) }
  const needle = token.trim().toLowerCase()
  const devices = allDevices()
  const match = devices.find((d) => d.id === needle) ?? devices.find((d) => d.name.toLowerCase() === needle) ?? devices.find((d) => d.name.toLowerCase().includes(needle))
  return match ? { deviceId: match.id } : null
}

export function findView(tabId: string, token?: string): ViewRef | undefined {
  const views = viewsOfTab(tabId, 'a')
  if (!token) return views[0]
  const needle = token.trim().toLowerCase()
  return views.find((r) => r.paneId === token || r.viewId === token) ?? views.find((r) => viewName(r).toLowerCase() === needle) ?? views.find((r) => viewName(r).toLowerCase().includes(needle))
}

export const viewLabel = (viewId: string): string => {
  const ref = refOf(viewId)
  return ref ? viewName(ref) : viewId
}

export const otherSide = (paneId: string): string => viewIdOf(paneId, 'b')

export async function clearSiteData(tabId: string, kinds: Array<'cookies' | 'storage' | 'cache'>): Promise<void> {
  const tab = tabOf(tabId)
  if (!tab) return
  const partitions = new Set(tab.panes.map((p) => (p.isolated ? `persist:facet-${p.id}` : 'persist:facet')))
  await Promise.all([...partitions].map((partition) => bridge.clearData(partition, kinds)))
  toast('Site data cleared', 'success')
}
