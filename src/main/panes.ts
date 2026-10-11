import { BrowserWindow, Menu, clipboard, shell, webContents, type WebContents } from 'electron'
import { platformFor } from '@shared/devices'
import type { EmulationSpec, MediaQueryInfo, NetworkProfile, PaneEvent } from '@shared/types'

interface PaneSession {
  paneId: string
  wc: WebContents
  spec?: EmulationSpec
  /** Last value sent per command group, so unchanged groups are skipped. */
  sent: Map<string, string>
  requests: Map<string, string>
  popups: 'same' | 'external'
  touchEmit: boolean
}

const panes = new Map<string, PaneSession>()
let hostWindow: BrowserWindow | null = null

export function setHostWindow(win: BrowserWindow | null): void {
  hostWindow = win
}

function emit(event: PaneEvent): void {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send('facet:pane-event', event)
}

// Throughput in bytes/s, latency in ms. Matches the Chrome DevTools presets.
const NETWORK: Record<NetworkProfile, { offline: boolean; latency: number; down: number; up: number }> = {
  online: { offline: false, latency: 0, down: -1, up: -1 },
  fast4g: { offline: false, latency: 165, down: 1_012_500, up: 168_750 },
  slow4g: { offline: false, latency: 562, down: 180_000, up: 84_375 },
  '3g': { offline: false, latency: 2000, down: 50_000, up: 50_000 },
  offline: { offline: true, latency: 0, down: 0, up: 0 }
}

export function getPane(paneId: string): PaneSession | undefined {
  const pane = panes.get(paneId)
  if (pane && pane.wc.isDestroyed()) {
    panes.delete(paneId)
    return undefined
  }
  return pane
}

export function paneIds(): string[] {
  return [...panes.keys()]
}

async function send<T = unknown>(pane: PaneSession, method: string, params?: object): Promise<T> {
  if (!pane.wc.debugger.isAttached()) pane.wc.debugger.attach('1.3')
  return pane.wc.debugger.sendCommand(method, params) as Promise<T>
}

export function cdp<T = unknown>(paneId: string, method: string, params?: object): Promise<T> {
  const pane = getPane(paneId)
  if (!pane) return Promise.reject(new Error(`Unknown pane ${paneId}`))
  return send<T>(pane, method, params)
}

export function registerPane(paneId: string, wcId: number, popups: 'same' | 'external'): boolean {
  const wc = webContents.fromId(wcId)
  if (!wc || wc.isDestroyed()) return false
  const existing = panes.get(paneId)
  if (existing?.wc === wc) {
    existing.popups = popups
    return true
  }

  const pane: PaneSession = { paneId, wc, sent: new Map(), requests: new Map(), popups, touchEmit: false }
  panes.set(paneId, pane)

  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  } catch (err) {
    emit({ paneId, type: 'detached', message: String(err) })
  }

  wc.debugger.on('detach', (_e, reason) => {
    // Emulation is lost with the session; forget what was sent so the next
    // apply pushes everything again.
    pane.sent.clear()
    if (reason !== 'target closed') emit({ paneId, type: 'detached', message: reason })
  })

  wc.debugger.on('message', (_e, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      if (pane.requests.size > 600) pane.requests.clear()
      pane.requests.set(params.requestId, params.request.url)
    } else if (method === 'Network.responseReceived') {
      const { status, url } = params.response
      if (status >= 400) emit({ paneId, type: 'network', status, url, message: `${status} ${params.response.statusText || ''}`.trim() })
    } else if (method === 'Network.loadingFailed') {
      if (params.canceled || params.errorText === 'net::ERR_ABORTED') return
      emit({ paneId, type: 'network', status: 0, url: pane.requests.get(params.requestId) ?? '', message: params.errorText })
    }
  })
  send(pane, 'Network.enable').catch(() => {})

  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      if (pane.popups === 'external') void shell.openExternal(url)
      else setImmediate(() => !wc.isDestroyed() && wc.loadURL(url).catch(() => {}))
    }
    return { action: 'deny' }
  })

  wc.on('context-menu', (_e, p) => {
    const act = (action: string) => () => emit({ paneId, type: 'context', action, x: p.x, y: p.y, url: p.linkURL || p.srcURL })
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: act('back') },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: act('forward') },
      { label: 'Reload', click: act('reload') },
      { type: 'separator' }
    ]
    if (p.linkURL) {
      items.push(
        { label: 'Copy Link Address', click: () => void clipboard.writeText(p.linkURL) },
        { label: 'Open Link in Default Browser', click: () => void shell.openExternal(p.linkURL) },
        { label: 'Open Link in New Tab', click: act('open-tab') },
        { type: 'separator' }
      )
    }
    if (p.selectionText) items.push({ role: 'copy' }, { type: 'separator' })
    if (p.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' })
    items.push(
      { label: 'Screenshot This Device', click: act('screenshot') },
      { label: 'Full-Page Screenshot', click: act('screenshot-full') },
      { type: 'separator' },
      { label: 'Compare Element Across Devices', click: act('inspect') },
      { label: 'Inspect in DevTools', click: () => wc.inspectElement(p.x, p.y) }
    )
    Menu.buildFromTemplate(items).popup()
  })

  wc.once('destroyed', () => {
    if (panes.get(paneId) === pane) panes.delete(paneId)
  })
  return true
}

export function unregisterPane(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  panes.delete(paneId)
  try {
    if (!pane.wc.isDestroyed() && pane.wc.debugger.isAttached()) pane.wc.debugger.detach()
  } catch {
    /* already gone */
  }
}

const INITIAL_SCALE = `(() => {
  const meta = document.querySelector('meta[name="viewport"]')
  const match = meta && /initial-scale\\s*=\\s*([\\d.]+)/i.exec(meta.content)
  return match ? Number(match[1]) : 0
})()`

function uaMetadata(spec: EmulationSpec, chromeMajor: string): object | undefined {
  const platform = { ios: 'iOS', ipados: 'iOS', android: 'Android', macos: 'macOS', windows: 'Windows', chromeos: 'Chrome OS', watchos: 'iOS', other: '' }[spec.os]
  if (!platform) return undefined
  return {
    brands: [
      { brand: 'Chromium', version: chromeMajor },
      { brand: 'Google Chrome', version: chromeMajor },
      { brand: 'Not_A Brand', version: '24' }
    ],
    platform,
    platformVersion: spec.os === 'android' ? '14.0.0' : spec.os === 'windows' ? '15.0.0' : '18.6.0',
    architecture: spec.mobile ? '' : 'x86',
    model: spec.os === 'android' && spec.mobile ? 'K' : '',
    mobile: spec.mobile && spec.os !== 'ipados'
  }
}

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return headers
}

/**
 * Pushes an emulation spec to a pane over CDP. Returns the commands that
 * failed; those are experimental ones the embedded Chromium may not support.
 */
export async function applyEmulation(paneId: string, spec: EmulationSpec): Promise<string[]> {
  const pane = getPane(paneId)
  if (!pane) return ['pane not registered']
  pane.spec = spec
  const failed: string[] = []
  const chromeMajor = process.versions.chrome.split('.')[0]

  const group = async (key: string, value: unknown, run: () => Promise<unknown>): Promise<void> => {
    const json = JSON.stringify(value)
    if (pane.sent.get(key) === json) return
    try {
      await run()
      pane.sent.set(key, json)
    } catch (err) {
      failed.push(`${key}: ${(err as Error).message}`)
    }
  }

  await group('ua', [spec.userAgent, spec.locale, spec.os, spec.mobile], () =>
    spec.userAgent
      ? send(pane, 'Emulation.setUserAgentOverride', {
          userAgent: spec.userAgent,
          platform: platformFor(spec.os) || undefined,
          acceptLanguage: spec.locale || undefined,
          userAgentMetadata: uaMetadata(spec, chromeMajor)
        })
      : Promise.resolve()
  )

  await group('metrics', [spec.width, spec.height, spec.dpr, spec.mobile, spec.landscape], async () => {
    await send(pane, 'Emulation.setDeviceMetricsOverride', {
      width: spec.width,
      height: spec.height,
      deviceScaleFactor: spec.dpr,
      mobile: spec.mobile,
      screenWidth: spec.width,
      screenHeight: spec.height,
      screenOrientation: spec.landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 }
    })
    // Chromium carries the old zoom across a resize, which leaves a rotated
    // phone zoomed in. Put the page back at the scale it asks for; a value
    // below the minimum is clamped up, which means "fit" for pages that
    // declare no initial scale.
    if (spec.mobile) {
      const initial = await pane.wc.executeJavaScript(INITIAL_SCALE, false).catch(() => 0)
      await send(pane, 'Emulation.setPageScaleFactor', { pageScaleFactor: initial > 0 ? initial : 0.01 }).catch(() => {})
    }
  })

  await group('touch', spec.touch, () =>
    send(pane, 'Emulation.setTouchEmulationEnabled', { enabled: spec.touch, maxTouchPoints: spec.touch ? 5 : 1 })
  )

  const features: Array<{ name: string; value: string }> = []
  if (spec.colorScheme !== 'system') features.push({ name: 'prefers-color-scheme', value: spec.colorScheme })
  if (spec.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' })
  if (spec.contrast !== 'no-preference') features.push({ name: 'prefers-contrast', value: spec.contrast })
  if (spec.forcedColors) features.push({ name: 'forced-colors', value: 'active' })
  if (spec.reducedTransparency) features.push({ name: 'prefers-reduced-transparency', value: 'reduce' })
  if (spec.reducedData) features.push({ name: 'prefers-reduced-data', value: 'reduce' })
  await group('media', [spec.media, features], () =>
    send(pane, 'Emulation.setEmulatedMedia', { media: spec.media === 'print' ? 'print' : '', features })
  )

  await group('vision', spec.vision, () => send(pane, 'Emulation.setEmulatedVisionDeficiency', { type: spec.vision }))
  await group('autoDark', spec.autoDark, () =>
    send(pane, 'Emulation.setAutoDarkModeOverride', spec.autoDark ? { enabled: true } : {})
  )

  const net = NETWORK[spec.network]
  await group('network', spec.network, () =>
    send(pane, 'Network.emulateNetworkConditions', {
      offline: net.offline,
      latency: net.latency,
      downloadThroughput: net.down,
      uploadThroughput: net.up
    })
  )
  await group('cpu', spec.cpu, () => send(pane, 'Emulation.setCPUThrottlingRate', { rate: Math.max(1, spec.cpu) }))
  await group('cache', spec.disableCache, () => send(pane, 'Network.setCacheDisabled', { cacheDisabled: spec.disableCache }))
  await group('headers', spec.headers, () =>
    send(pane, 'Network.setExtraHTTPHeaders', { headers: parseHeaders(spec.headers) })
  )
  await group('js', spec.disableJs, () => send(pane, 'Emulation.setScriptExecutionDisabled', { value: spec.disableJs }))
  await group('locale', spec.locale, () => send(pane, 'Emulation.setLocaleOverride', { locale: spec.locale }))
  await group('timezone', spec.timezone, () =>
    send(pane, 'Emulation.setTimezoneOverride', { timezoneId: spec.timezone })
  )
  await group('geo', spec.geolocation, () =>
    spec.geolocation
      ? send(pane, 'Emulation.setGeolocationOverride', spec.geolocation)
      : send(pane, 'Emulation.clearGeolocationOverride')
  )
  await group('safeArea', spec.safeArea, () => send(pane, 'Emulation.setSafeAreaInsetsOverride', { insets: spec.safeArea }))

  return failed
}

/**
 * Converts mouse input to touch events for a pane. Chromium's touch emulator
 * is shared by the whole window, not the guest, so this must only stay on
 * while the cursor is actually over that pane.
 */
export async function setTouchEmit(paneId: string, enabled: boolean): Promise<void> {
  const pane = getPane(paneId)
  if (!pane || pane.touchEmit === enabled) return
  pane.touchEmit = enabled
  await send(pane, 'Emulation.setEmitTouchEventsForMouse', {
    enabled,
    configuration: pane.spec?.mobile ? 'mobile' : 'desktop'
  }).catch(() => {})
}

export function releaseAllTouchEmit(): void {
  for (const id of panes.keys()) void setTouchEmit(id, false)
}

const toPx = (value: number, unit: string): number | null => {
  if (unit === 'px') return value
  if (unit === 'em' || unit === 'rem') return value * 16
  return null
}

/** Width breakpoints declared by the page's stylesheets, including cross-origin ones. */
export async function mediaQueries(paneId: string): Promise<MediaQueryInfo[]> {
  const pane = getPane(paneId)
  if (!pane) return []
  await send(pane, 'DOM.enable')
  await send(pane, 'CSS.enable')
  type Media = { mediaList?: Array<{ expressions: Array<{ value: number; unit: string; feature: string }> }> }
  const { medias } = await send<{ medias: Media[] }>(pane, 'CSS.getMediaQueries')
  await send(pane, 'CSS.disable').catch(() => {})
  await send(pane, 'DOM.disable').catch(() => {})

  const found = new Map<string, MediaQueryInfo>()
  for (const media of medias) {
    for (const query of media.mediaList ?? []) {
      for (const exp of query.expressions) {
        if (exp.feature !== 'min-width' && exp.feature !== 'max-width') continue
        const px = toPx(exp.value, exp.unit)
        if (px === null) continue
        const key = `${exp.feature}:${px}`
        const entry = found.get(key)
        if (entry) entry.count++
        else found.set(key, { text: `(${exp.feature}: ${exp.value}${exp.unit})`, feature: exp.feature, px: Math.round(px), count: 1 })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.px - b.px)
}

export function openDevTools(paneId: string): void {
  const pane = getPane(paneId)
  if (!pane) return
  if (pane.wc.isDevToolsOpened()) pane.wc.devToolsWebContents?.focus()
  else pane.wc.openDevTools({ mode: 'detach' })
}

export function inspectAt(paneId: string, x: number, y: number): void {
  getPane(paneId)?.wc.inspectElement(Math.round(x), Math.round(y))
}
