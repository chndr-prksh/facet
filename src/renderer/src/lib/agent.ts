import { RESPONSIVE_ID } from '@shared/devices'
import type { AgentRequest, Emulation, Pane } from '@shared/types'
import { captureTab, findView, loadBreakpoints, loadMeta, measureEverywhere, resolveDeviceToken, runA11y, runIssues, toJpeg, viewLabel, viewName } from '@/lib/actions'
import type { ToolContent } from '@/lib/bridge'
import { readPage } from '@/lib/scripts'
import { checkMeta } from '@/lib/seo'
import { exec, getView, navigate, scrollAll, viewsOfTab } from '@/lib/views'
import { useRuntime, viewOf } from '@/store/runtime'
import { activeTab, allDevices, deviceById, paneSize, uid, useWorkspace } from '@/store/workspace'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const text = (value: unknown): ToolContent => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]

/** Waits for every pane of the tab to exist and finish loading. */
async function settle(tabId: string, timeout = 30_000): Promise<void> {
  await sleep(300)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const expected = useWorkspace.getState().tabs.find((t) => t.id === tabId)?.panes.length ?? 0
    const refs = viewsOfTab(tabId, 'a')
    if (refs.length >= expected && refs.every((r) => viewOf(r.viewId).ready && !viewOf(r.viewId).loading)) break
    await sleep(120)
  }
  await sleep(250)
}

function describe(): object {
  const tab = activeTab()
  const { settings } = useWorkspace.getState()
  return {
    url: tab.url,
    compareUrl: tab.compareUrl,
    title: tab.title,
    layout: settings.layout,
    mirroring: settings.sync,
    emulation: tab.emulation,
    overlays: tab.overlays,
    devices: viewsOfTab(tab.id, 'a').map((ref) => {
      const pane = tab.panes.find((p) => p.id === ref.paneId)!
      const device = deviceById(pane.deviceId)
      const view = viewOf(ref.viewId)
      return {
        id: pane.id,
        name: viewName(ref),
        ...paneSize(pane, device),
        pixelRatio: device.dpr,
        touch: device.touch,
        url: view.url,
        loading: view.loading,
        horizontalOverflow: view.metrics?.overflowX ?? false,
        consoleErrors: view.errors,
        loadError: view.error?.description
      }
    })
  }
}

const requireView = (token?: string): string => {
  const ref = findView(activeTab().id, token)
  if (!ref) throw new Error(token ? `No open device matches "${token}". Call get_state for the list.` : 'No device panes are open')
  return ref.viewId
}

/** A trusted click, so page handlers and interaction mirroring both treat it as real. */
async function clickIn(viewId: string, selector: string): Promise<void> {
  const view = getView(viewId)
  if (!view) throw new Error('Pane is not ready')
  const point = await exec(viewId, (sel: string) => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    const vv = window.visualViewport
    const scale = vv ? vv.scale : 1
    return { x: (r.left + r.width / 2 - (vv ? vv.offsetLeft : 0)) * scale, y: (r.top + r.height / 2 - (vv ? vv.offsetTop : 0)) * scale, empty: r.width === 0 }
  }, selector)
  if (!point) throw new Error(`No element matches ${selector}`)
  if (point.empty) throw new Error(`${selector} is not visible on this device`)
  const at = { x: Math.round(point.x), y: Math.round(point.y) }
  await view.sendInputEvent({ type: 'mouseMove', ...at })
  await view.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
  await view.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
  await sleep(350)
}

export async function handleAgent(req: AgentRequest): Promise<ToolContent> {
  const ws = useWorkspace.getState()
  const tab = activeTab()
  const args = req.args as Record<string, never>

  switch (req.tool) {
    case 'get_state':
      return text(describe())

    case 'navigate': {
      navigate(tab.id, String(args.url))
      await settle(tab.id)
      return text(describe())
    }

    case 'list_devices': {
      const open = new Set(tab.panes.map((p) => p.deviceId))
      return text(
        allDevices()
          .filter((d) => d.id !== RESPONSIVE_ID)
          .map((d) => ({ id: d.id, name: d.name, kind: d.kind, width: d.width, height: d.height, pixelRatio: d.dpr, open: open.has(d.id) }))
      )
    }

    case 'set_devices': {
      const pool = [...tab.panes]
      const unknown: string[] = []
      const panes: Pane[] = []
      for (const token of args.devices as string[]) {
        const match = resolveDeviceToken(token)
        if (!match) {
          unknown.push(token)
          continue
        }
        // Reuse a pane that already shows this device so its page stays loaded.
        const i = pool.findIndex((p) => p.deviceId === match.deviceId && p.width === match.width && p.height === match.height)
        panes.push(i >= 0 ? pool.splice(i, 1)[0] : { id: uid(), rotated: false, ...match })
      }
      if (!panes.length) throw new Error(`Unknown devices: ${unknown.join(', ')}. Call list_devices.`)
      ws.updateTab(tab.id, { panes })
      await settle(tab.id)
      return text({ ...describe(), unknown: unknown.length ? unknown : undefined })
    }

    case 'screenshot': {
      const paneId = args.device ? findView(tab.id, args.device)?.paneId : undefined
      if (args.device && !paneId) throw new Error(`No open device matches "${args.device}"`)
      const shots = await captureTab(tab.id, { fullPage: !!args.fullPage, paneId, save: false })
      if (!shots.length) throw new Error('Nothing to capture; load a page first')
      const content: ToolContent = []
      for (const shot of shots) {
        content.push({ type: 'text', text: `${shot.name} — ${Math.round(shot.width / shot.dpr)}×${Math.round(shot.height / shot.dpr)} CSS px` })
        content.push({ type: 'image', data: await toJpeg(shot.dataUrl), mimeType: 'image/jpeg' })
      }
      return content
    }

    case 'audit_responsive': {
      const results = await runIssues(tab.id)
      const devices = Object.entries(results).map(([viewId, issues]) => ({
        device: viewLabel(viewId),
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warn').length,
        issues: issues.map(({ rule, severity, title, detail, selector, hint }) => ({ rule, severity, title, detail: detail || undefined, selector, fix: hint }))
      }))
      return text({ url: tab.url, devices })
    }

    case 'audit_accessibility': {
      const viewId = requireView(args.device)
      const result = await runA11y(tab.id, viewId)
      if (!result) throw new Error('Pane is not ready')
      if (result.error) throw new Error(result.error)
      return text({ device: viewLabel(viewId), violations: result.violations, passedRules: result.passes, needsManualReview: result.incomplete })
    }

    case 'get_meta': {
      await loadMeta(tab.id)
      const { meta } = useRuntime.getState()
      if (!meta) throw new Error('No page loaded')
      return text({ ...meta, checks: checkMeta(meta).filter((c) => c.level !== 'ok') })
    }

    case 'get_console': {
      const level = (args.level as string) ?? 'default'
      const entries = useRuntime
        .getState()
        .console.filter((e) => e.tabId === tab.id)
        .filter((e) => (level === 'all' ? true : level === 'error' ? e.level === 'error' || e.level === 'network' : e.level !== 'log' && e.level !== 'info'))
        .slice(-150)
        .map((e) => ({ device: viewLabel(e.paneId), level: e.level, message: e.message, source: e.source ? `${e.source}${e.line ? `:${e.line}` : ''}` : undefined }))
      return text(entries.length ? entries : 'No matching console messages.')
    }

    case 'get_breakpoints': {
      await loadBreakpoints(tab.id)
      return text(useRuntime.getState().breakpoints ?? [])
    }

    case 'compare_element': {
      const reports = await measureEverywhere(tab.id, String(args.selector))
      return text(Object.entries(reports).map(([viewId, report]) => ({ device: viewLabel(viewId), ...report })))
    }

    case 'read_page': {
      const viewId = requireView(args.device)
      return text({ device: viewLabel(viewId), ...(await exec(viewId, readPage)) })
    }

    case 'click': {
      const viewId = requireView(args.device)
      await clickIn(viewId, String(args.selector))
      await settle(tab.id, 8000)
      return text({ clicked: args.selector, device: viewLabel(viewId), url: viewOf(viewId).url, title: viewOf(viewId).title })
    }

    case 'type_text': {
      const viewId = requireView(args.device)
      const view = getView(viewId)
      if (!view) throw new Error('Pane is not ready')
      const ok = await exec(viewId, (sel: string) => {
        const el = document.querySelector<HTMLInputElement>(sel)
        if (!el) return false
        el.focus()
        if (typeof el.select === 'function') el.select()
        return true
      }, String(args.selector))
      if (!ok) throw new Error(`No element matches ${args.selector}`)
      await view.insertText(String(args.text))
      if (args.pressEnter) {
        await view.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        await view.sendInputEvent({ type: 'char', keyCode: 'Return' })
        await view.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        await settle(tab.id, 8000)
      }
      return text({ typed: args.text, into: args.selector, device: viewLabel(viewId), url: viewOf(viewId).url })
    }

    case 'scroll': {
      if (args.selector) {
        await Promise.all(
          viewsOfTab(tab.id).map((ref) =>
            exec(ref.viewId, (sel: string) => document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'instant' }), String(args.selector)).catch(() => undefined)
          )
        )
      } else scrollAll(tab.id, Number(args.position ?? 0))
      await sleep(200)
      return text('Scrolled all panes.')
    }

    case 'set_emulation': {
      ws.setEmulation(tab.id, args as Partial<Emulation>)
      await sleep(400)
      return text({ emulation: activeTab().emulation })
    }

    default:
      throw new Error(`Unknown tool ${req.tool}`)
  }
}
