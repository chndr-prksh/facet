export type DeviceKind = 'phone' | 'foldable' | 'tablet' | 'laptop' | 'desktop' | 'watch' | 'responsive'
export type DeviceOS = 'ios' | 'ipados' | 'android' | 'macos' | 'windows' | 'chromeos' | 'watchos' | 'other'
export type Cutout = 'island' | 'notch' | 'punch' | 'none'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Device {
  id: string
  name: string
  brand: string
  kind: DeviceKind
  os: DeviceOS
  /** CSS pixels, portrait for handhelds and landscape for laptops/desktops. */
  width: number
  height: number
  dpr: number
  /** Mobile viewport behaviour: honours <meta viewport>, overlay scrollbars, text autosizing. */
  mobile: boolean
  touch: boolean
  cutout?: Cutout
  /** Safe-area insets in the device's natural orientation. */
  safeArea?: Insets
  /** Screen corner radius in CSS px, used by the device frame. */
  radius?: number
  /** Explicit UA string; when empty one is derived from `os`. */
  userAgent?: string
  custom?: boolean
}

export type ColorScheme = 'system' | 'light' | 'dark'
export type Vision =
  | 'none'
  | 'blurredVision'
  | 'reducedContrast'
  | 'achromatopsia'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia'
export type NetworkProfile = 'online' | 'fast4g' | 'slow4g' | '3g' | 'offline'

/** User-facing emulation settings. Set per tab, overridable per pane. */
export interface Emulation {
  colorScheme: ColorScheme
  reducedMotion: boolean
  contrast: 'no-preference' | 'more' | 'less'
  forcedColors: boolean
  reducedTransparency: boolean
  reducedData: boolean
  media: 'screen' | 'print'
  vision: Vision
  network: NetworkProfile
  cpu: number
  touch: 'auto' | 'on' | 'off'
  userAgent: string
  locale: string
  timezone: string
  geolocation: { latitude: number; longitude: number; accuracy: number } | null
  disableJs: boolean
  disableCache: boolean
  autoDark: boolean
  headers: string
  /** Full-screen web app: content runs under the notch and safe-area insets apply. */
  standalone: boolean
}

export const DEFAULT_EMULATION: Emulation = {
  colorScheme: 'system',
  reducedMotion: false,
  contrast: 'no-preference',
  forcedColors: false,
  reducedTransparency: false,
  reducedData: false,
  media: 'screen',
  vision: 'none',
  network: 'online',
  cpu: 1,
  touch: 'auto',
  userAgent: '',
  locale: '',
  timezone: '',
  geolocation: null,
  disableJs: false,
  disableCache: false,
  autoDark: false,
  headers: '',
  standalone: false
}

/** Fully resolved settings the main process turns into CDP commands. */
export interface EmulationSpec extends Omit<Emulation, 'touch' | 'userAgent'> {
  width: number
  height: number
  dpr: number
  mobile: boolean
  touch: boolean
  landscape: boolean
  os: DeviceOS
  userAgent: string
  safeArea: Insets
}

export interface Pane {
  id: string
  deviceId: string
  rotated: boolean
  /** Free-form size, only used when the device kind is `responsive`. */
  width?: number
  height?: number
  overrides?: Partial<Emulation>
  /** Excluded from interaction mirroring. */
  unsynced?: boolean
  /** Uses its own cookie jar / storage instead of the shared session. */
  isolated?: boolean
}

export interface Tab {
  id: string
  url: string
  title: string
  favicon?: string
  /** Second URL shown next to the first on every device, for A/B comparison. */
  compareUrl?: string
  panes: Pane[]
  emulation: Emulation
  overlays: string[]
  liveCss: string
  focusPaneId?: string
  watchDir?: string
}

export interface Suite {
  id: string
  name: string
  deviceIds: string[]
  builtin?: boolean
}

export type Layout = 'row' | 'wrap' | 'focus'
export type PanelTab =
  | 'issues'
  | 'a11y'
  | 'seo'
  | 'outline'
  | 'inspect'
  | 'console'
  | 'breakpoints'
  | 'storage'
  | 'inject'

export interface SyncSettings {
  scroll: boolean
  click: boolean
  input: boolean
  nav: boolean
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  layout: Layout
  /** A scale factor, or 'fit' to scale every pane to the available height. */
  zoom: number | 'fit'
  showFrames: boolean
  stageBg: 'dots' | 'plain' | 'checker'
  sync: SyncSettings
  homepage: string
  screenshotDir: string
  popups: 'same' | 'external'
  mcpEnabled: boolean
  mcpPort: number
  panelOpen: boolean
  panelWidth: number
  panelTab: PanelTab
  ignoreCertErrors: boolean
  /** Turn mouse drags into touch events over touch-capable panes. */
  touchGestures: boolean
}

export interface Bookmark {
  url: string
  title: string
}

export interface Snippet {
  id: string
  name: string
  code: string
}

export interface PersistedState {
  version: number
  tabs: Tab[]
  activeTabId: string
  suites: Suite[]
  customDevices: Device[]
  bookmarks: Bookmark[]
  history: Bookmark[]
  snippets: Snippet[]
  settings: Settings
}

/* ---------- runtime (not persisted) ---------- */

export interface Vitals {
  ttfb?: number
  fcp?: number
  lcp?: number
  cls?: number
  inp?: number
  domContentLoaded?: number
  load?: number
}

export interface PageMetrics {
  scrollWidth: number
  scrollHeight: number
  viewportWidth: number
  overflowX: boolean
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'network'

export interface ConsoleEntry {
  id: number
  tabId: string
  paneId: string
  level: ConsoleLevel
  message: string
  source?: string
  line?: number
  time: number
}

export type Severity = 'error' | 'warn' | 'info'

export interface Issue {
  rule: string
  severity: Severity
  title: string
  detail: string
  selector?: string
  /** What to do about it. */
  hint?: string
}

export interface SyncEvent {
  type: 'scroll' | 'click' | 'input' | 'submit' | 'key'
  selector?: string
  /** Scroll position as a 0..1 fraction of the scrollable range. */
  xr?: number
  yr?: number
  value?: string
  checked?: boolean
  key?: string
}

export interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  /** Image pixels per CSS pixel: the device's ratio, capped by the display's. */
  scale: number
  truncated?: boolean
}

export interface MediaQueryInfo {
  text: string
  feature: 'min-width' | 'max-width'
  px: number
  count: number
}

export interface CookieInfo {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: string
  expires?: number
}

export interface LinkCheck {
  url: string
  status: number
  ok: boolean
  error?: string
}

export interface DevServer {
  port: number
  url: string
  title?: string
}

export interface PaneEvent {
  paneId: string
  type: 'network' | 'detached' | 'context'
  message?: string
  url?: string
  status?: number
  action?: string
  x?: number
  y?: number
}

export interface AgentRequest {
  id: number
  tool: string
  args: Record<string, unknown>
}
