import type {
  AgentRequest,
  CaptureResult,
  CookieInfo,
  DevServer,
  EmulationSpec,
  LinkCheck,
  MediaQueryInfo,
  PaneEvent
} from '@shared/types'

interface Bridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (...args: never[]) => void): () => void
}

declare global {
  interface Window {
    facet: Bridge
  }
}

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.facet.invoke(channel, ...args) as Promise<T>

export interface AppInfo {
  version: string
  chrome: string
  electron: string
  platform: string
  screenshotDir: string
  mcpTools: string[]
}

export interface McpStatus {
  running: boolean
  port: number
  url: string
  error?: string
}

export type ToolContent = Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>

export const bridge = {
  info: () => call<AppInfo>('app:info'),
  ready: () => call<string | null>('app:ready'),
  setRuntime: (next: { ignoreCertErrors?: boolean; popups?: 'same' | 'external' }) => call<void>('app:runtime', next),

  loadState: () => call<unknown>('state:load'),
  saveState: (state: unknown) => call<void>('state:save', state),

  registerPane: (paneId: string, wcId: number) => call<boolean>('pane:register', paneId, wcId),
  unregisterPane: (paneId: string) => call<void>('pane:unregister', paneId),
  emulate: (paneId: string, spec: EmulationSpec) => call<string[]>('pane:emulate', paneId, spec),
  capture: (paneId: string, fullPage: boolean) => call<CaptureResult>('pane:capture', paneId, fullPage),
  devtools: (paneId: string) => call<void>('pane:devtools', paneId),
  inspectAt: (paneId: string, x: number, y: number) => call<void>('pane:inspect-at', paneId, x, y),
  mediaQueries: (paneId: string) => call<MediaQueryInfo[]>('pane:media-queries', paneId),
  touchEmit: (paneId: string, enabled: boolean) => call<void>('pane:touch-emit', paneId, enabled),
  cursor: () => call<{ x: number; y: number } | null>('cursor:pos'),

  saveShots: (items: Array<{ name: string; dataUrl: string }>, site: string, dir: string) => call<string[]>('shots:save', items, site, dir),
  copyImage: (dataUrl: string) => call<void>('shots:copy', dataUrl),
  reveal: (path: string) => call<void>('shell:reveal', path),
  openExternal: (url: string) => call<void>('shell:open-external', url),

  cookies: (partition: string, url: string) => call<CookieInfo[]>('cookies:list', partition, url),
  removeCookie: (partition: string, url: string, name: string) => call<void>('cookies:remove', partition, url, name),
  clearData: (partition: string, kinds: Array<'cookies' | 'storage' | 'cache'>, origin?: string) => call<void>('data:clear', partition, kinds, origin),
  checkLinks: (urls: string[]) => call<LinkCheck[]>('links:check', urls),
  scanDevServers: () => call<DevServer[]>('dev:scan'),

  watch: (key: string, dir: string) => call<boolean>('live:watch', key, dir),
  unwatch: (key: string) => call<void>('live:unwatch', key),

  pickFolder: () => call<string | null>('dialog:pick-folder'),
  pickHtml: () => call<string | null>('dialog:pick-html'),
  pickImage: () => call<string | null>('dialog:pick-image'),

  mcpStatus: () => call<McpStatus>('mcp:status'),
  setMcp: (enabled: boolean, port: number) => call<McpStatus>('mcp:set', enabled, port),
  agentRespond: (id: number, ok: boolean, payload: ToolContent | string) => call<void>('agent:respond', id, ok, payload),
  authRespond: (id: number, creds: [string, string] | null) => call<void>('auth:respond', id, creds),

  onCommand: (fn: (id: string) => void) => window.facet.on('facet:command', fn),
  onOpenUrl: (fn: (url: string) => void) => window.facet.on('facet:open-url', fn),
  onPaneEvent: (fn: (event: PaneEvent) => void) => window.facet.on('facet:pane-event', fn),
  onAgentRequest: (fn: (req: AgentRequest) => void) => window.facet.on('facet:agent-request', fn),
  onLiveChange: (fn: (change: { key: string; kind: 'css' | 'full'; file: string }) => void) => window.facet.on('facet:live-change', fn),
  onAuthRequest: (fn: (req: { id: number; host: string; realm: string }) => void) => window.facet.on('facet:auth-request', fn)
}
