import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, screen, shell, type Session } from 'electron'
import type { AgentRequest, EmulationSpec } from '@shared/types'
import { capturePane, copyImage, defaultScreenshotDir, saveImages } from './capture'
import { TOOL_NAMES, mcpStatus, startMcp, stopMcp, type ToolContent } from './mcp'
import { buildMenu } from './menu'
import {
  applyEmulation,
  inspectAt,
  mediaQueries,
  openDevTools,
  registerPane,
  setHostWindow,
  setTouchEmit,
  unregisterPane
} from './panes'
import {
  checkLinks,
  clearData,
  listCookies,
  loadState,
  removeCookie,
  saveState,
  scanDevServers,
  unwatchAll,
  unwatchDir,
  watchDir
} from './services'

// Guests are arbitrary web pages; Electron's CSP advisories about them are noise in their consoles.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

const E2E = process.env.FACET_E2E === '1'
if (process.env.FACET_USER_DATA) app.setPath('userData', process.env.FACET_USER_DATA)

const PROTOCOL = 'facet'
const GUEST_PRELOAD = join(__dirname, '../preload/guest.js')

let win: BrowserWindow | null = null
let rendererReady = false
let pendingUrl: string | null = null
const runtime = { ignoreCertErrors: false, popups: 'same' as 'same' | 'external' }

/* ---------- launch arguments & deep links ---------- */

function urlFromArgs(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith(`${PROTOCOL}://`)) return urlFromDeepLink(arg)
    if (/^https?:\/\//i.test(arg) || /^localhost(:\d+)?/i.test(arg)) return arg
  }
  return null
}

function urlFromDeepLink(link: string): string | null {
  try {
    const u = new URL(link)
    const target = u.searchParams.get('url')
    return target && /^(https?:\/\/|localhost)/i.test(target) ? target : null
  } catch {
    return null
  }
}

function openUrl(url: string | null): void {
  if (!url) return
  if (win && rendererReady) {
    win.webContents.send('facet:open-url', url)
    if (win.isMinimized()) win.restore()
    win.focus()
  } else pendingUrl = url
}

/* ---------- sessions ---------- */

const mediaDecisions = new Map<string, boolean>()

function configureSession(ses: Session): void {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (['geolocation', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'window-management'].includes(permission)) {
      return callback(true)
    }
    if (permission === 'media' || permission === 'notifications' || permission === 'clipboard-read') {
      let origin = ''
      try {
        origin = new URL(details.requestingUrl || wc.getURL()).origin
      } catch {
        return callback(false)
      }
      const key = `${origin}|${permission}`
      const known = mediaDecisions.get(key)
      if (known !== undefined) return callback(known)
      // Several panes ask at once for the same page; answer them all with one prompt.
      mediaDecisions.set(key, false)
      if (!win) return callback(false)
      const label = { media: 'use your camera and microphone', notifications: 'show notifications', 'clipboard-read': 'read your clipboard' }[permission]
      void dialog
        .showMessageBox(win, { type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1, message: `${origin} wants to ${label}` })
        .then(({ response }) => {
          mediaDecisions.set(key, response === 0)
          callback(response === 0)
        })
      return
    }
    callback(false)
  })
}

const isLocalHost = (url: string): boolean => {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\]|.*\.(localhost|local|test))$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/* ---------- HTTP basic auth ---------- */

const credentials = new Map<string, Promise<[string, string] | null>>()
const authWaiters = new Map<number, (creds: [string, string] | null) => void>()
let authSeq = 0

function askCredentials(host: string, realm: string): Promise<[string, string] | null> {
  const key = `${host}|${realm}`
  let pending = credentials.get(key)
  if (!pending) {
    pending = new Promise((resolve) => {
      const id = ++authSeq
      authWaiters.set(id, resolve)
      win?.webContents.send('facet:auth-request', { id, host, realm })
    })
    credentials.set(key, pending)
    // A rejected login must be able to prompt again.
    void pending.then((creds) => !creds && credentials.delete(key))
  }
  return pending
}

/* ---------- agent bridge (MCP tools run in the renderer) ---------- */

const agentWaiters = new Map<number, { resolve: (c: ToolContent) => void; reject: (e: Error) => void }>()
let agentSeq = 0

function runTool(tool: string, args: Record<string, unknown>): Promise<ToolContent> {
  return new Promise((resolve, reject) => {
    if (!win || !rendererReady) return reject(new Error('Facet window is not ready'))
    const id = ++agentSeq
    const timer = setTimeout(() => {
      agentWaiters.delete(id)
      reject(new Error(`${tool} timed out`))
    }, 90_000)
    agentWaiters.set(id, {
      resolve: (c) => (clearTimeout(timer), resolve(c)),
      reject: (e) => (clearTimeout(timer), reject(e))
    })
    win.webContents.send('facet:agent-request', { id, tool, args } satisfies AgentRequest)
  })
}

/* ---------- window ---------- */

function createWindow(): void {
  const { workAreaSize } = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    width: Math.min(1680, workAreaSize.width),
    height: Math.min(1050, workAreaSize.height),
    minWidth: 760,
    minHeight: 480,
    show: false,
    backgroundColor: '#0d0e10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: join(__dirname, '../preload/host.js'),
      webviewTag: true,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  })
  setHostWindow(win)

  win.once('ready-to-show', () => (E2E ? win?.showInactive() : win?.show()))
  win.on('closed', () => {
    win = null
    rendererReady = false
    setHostWindow(null)
  })

  // The host UI never navigates; anything that tries is opened externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  // Guests get a fixed preload and can never opt into Node integration.
  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete (prefs as Record<string, unknown>).preloadURL
    prefs.preload = GUEST_PRELOAD
    prefs.nodeIntegration = false
    prefs.nodeIntegrationInSubFrames = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    prefs.webSecurity = true
    if (!/^(about:blank|https?:|file:)/i.test(params.src ?? '')) params.src = 'about:blank'
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/* ---------- IPC ---------- */

function registerIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void => {
    ipcMain.handle(channel, (event, ...args) => {
      // Only the host UI may call in; guest pages have no bridge at all.
      if (event.sender !== win?.webContents) throw new Error('Forbidden')
      return fn(...(args as A))
    })
  }

  handle('app:info', () => ({
    version: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    platform: process.platform,
    screenshotDir: defaultScreenshotDir(),
    mcpTools: TOOL_NAMES
  }))
  handle('app:ready', () => {
    rendererReady = true
    const url = pendingUrl ?? urlFromArgs(process.argv)
    pendingUrl = null
    return url
  })
  handle('app:runtime', (next: Partial<typeof runtime>) => void Object.assign(runtime, next))

  handle('state:load', () => loadState())
  handle('state:save', (state: unknown) => saveState(state))

  handle('pane:register', (paneId: string, wcId: number) => registerPane(paneId, wcId, runtime.popups))
  handle('pane:unregister', (paneId: string) => unregisterPane(paneId))
  handle('pane:emulate', (paneId: string, spec: EmulationSpec) => applyEmulation(paneId, spec))
  handle('pane:capture', (paneId: string, fullPage: boolean) => capturePane(paneId, fullPage))
  handle('pane:devtools', (paneId: string) => openDevTools(paneId))
  handle('pane:inspect-at', (paneId: string, x: number, y: number) => inspectAt(paneId, x, y))
  handle('pane:media-queries', (paneId: string) => mediaQueries(paneId))
  handle('pane:touch-emit', (paneId: string, enabled: boolean) => setTouchEmit(paneId, enabled))

  handle('cursor:pos', () => {
    if (!win) return null
    const point = screen.getCursorScreenPoint()
    const bounds = win.getContentBounds()
    return { x: point.x - bounds.x, y: point.y - bounds.y }
  })

  handle('shots:save', (items: Array<{ name: string; dataUrl: string }>, site: string, dir: string) => saveImages(items, site, dir))
  handle('shots:copy', (dataUrl: string) => copyImage(dataUrl))
  handle('shell:reveal', (path: string) => shell.showItemInFolder(path))
  handle('shell:open-external', (url: string) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  handle('cookies:list', (partition: string, url: string) => listCookies(partition, url))
  handle('cookies:remove', (partition: string, url: string, name: string) => removeCookie(partition, url, name))
  handle('data:clear', (partition: string, kinds: Array<'cookies' | 'storage' | 'cache'>, origin?: string) => clearData(partition, kinds, origin))
  handle('links:check', (urls: string[]) => checkLinks(urls))
  handle('dev:scan', () => scanDevServers())

  handle('live:watch', (key: string, dir: string) =>
    watchDir(key, dir, (kind, file) => win?.webContents.send('facet:live-change', { key, kind, file }))
  )
  handle('live:unwatch', (key: string) => unwatchDir(key))

  handle('dialog:pick-folder', async () => {
    if (!win) return null
    const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return filePaths[0] ?? null
  })
  handle('dialog:pick-html', async () => {
    if (!win) return null
    const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Web pages', extensions: ['html', 'htm', 'svg'] }] })
    return filePaths[0] ?? null
  })
  handle('dialog:pick-image', async () => {
    if (!win) return null
    const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] })
    if (!filePaths[0]) return null
    const ext = extname(filePaths[0]).slice(1).toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return `data:${mime};base64,${(await readFile(filePaths[0])).toString('base64')}`
  })

  handle('mcp:status', () => mcpStatus())
  handle('mcp:set', async (enabled: boolean, port: number) => (enabled ? startMcp(port, runTool, app.getVersion()) : stopMcp()))
  handle('agent:respond', (id: number, ok: boolean, payload: ToolContent | string) => {
    const waiter = agentWaiters.get(id)
    if (!waiter) return
    agentWaiters.delete(id)
    if (ok) waiter.resolve(payload as ToolContent)
    else waiter.reject(new Error(String(payload)))
  })
  handle('auth:respond', (id: number, creds: [string, string] | null) => {
    authWaiters.get(id)?.(creds)
    authWaiters.delete(id)
  })
}

/* ---------- lifecycle ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => openUrl(urlFromArgs(argv)))
  app.on('open-url', (e, url) => {
    e.preventDefault()
    openUrl(urlFromDeepLink(url))
  })

  // Self-signed certificates are routine on local dev servers.
  app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
    if (runtime.ignoreCertErrors || isLocalHost(url)) {
      event.preventDefault()
      callback(true)
    } else callback(false)
  })

  app.on('login', (event, _wc, _details, authInfo, callback) => {
    if (authInfo.isProxy) return
    event.preventDefault()
    void askCredentials(authInfo.host, authInfo.realm).then((creds) => (creds ? callback(creds[0], creds[1]) : callback()))
  })

  app.on('session-created', configureSession)

  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    // Pages may only reach web and file content; never app-internal schemes.
    contents.on('will-navigate', (event, url) => {
      if (!/^(https?|file|about|data|blob):/i.test(url)) {
        event.preventDefault()
        if (/^(mailto|tel):/i.test(url)) void shell.openExternal(url)
      }
    })
  })

  void app.whenReady().then(() => {
    // Sites sniff for "Electron" and refuse to work (Google sign-in among them).
    app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|facet|Facet)\/\S+/g, '')
    if (!E2E) app.setAsDefaultProtocolClient(PROTOCOL)
    registerIpc()
    buildMenu(() => win)
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    unwatchAll()
    void stopMcp()
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => {
    unwatchAll()
    void stopMcp()
  })
}

