import type { Layout, NetworkProfile, PanelTab, Vision } from '@shared/types'
import { addResponsivePane, captureTab, clearSiteData, openStudio, runAllAudits, setInspecting } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import { OVERLAYS } from '@/lib/overlays'
import { goHistory, navigate, reload, scrollAll, setCompare } from '@/lib/views'
import { useRuntime } from '@/store/runtime'
import { activeTab, allSuites, useWorkspace } from '@/store/workspace'

export interface Command {
  id: string
  title: string
  group: string
  /** Accelerator shown in menus, e.g. "Mod+Shift+S". */
  keys?: string
  run: () => void
  active?: boolean
}

export const emit = (name: string): void => void window.dispatchEvent(new CustomEvent(name))

const LAYOUTS: Layout[] = ['row', 'wrap', 'focus']
export const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'issues', label: 'Responsive issues' },
  { id: 'a11y', label: 'Accessibility' },
  { id: 'seo', label: 'SEO & social' },
  { id: 'outline', label: 'Outline' },
  { id: 'inspect', label: 'Element compare' },
  { id: 'console', label: 'Console' },
  { id: 'breakpoints', label: 'Breakpoints' },
  { id: 'storage', label: 'Storage' },
  { id: 'inject', label: 'CSS & snippets' }
]

export function zoomBy(factor: number): void {
  const ws = useWorkspace.getState()
  const current = typeof ws.settings.zoom === 'number' ? ws.settings.zoom : useRuntime.getState().effectiveZoom
  ws.setSettings({ zoom: Math.min(1.5, Math.max(0.15, Math.round(current * factor * 20) / 20)) })
}

/** Every action in the app, built from current state so toggles show their value. */
export function buildCommands(): Command[] {
  const ws = useWorkspace.getState()
  const rt = useRuntime.getState()
  const tab = activeTab()
  const { settings } = ws
  const set = ws.setSettings
  const emu = (patch: Parameters<typeof ws.setEmulation>[1]) => (): void => ws.setEmulation(tab.id, patch)
  const syncOn = settings.sync.scroll || settings.sync.click || settings.sync.input || settings.sync.nav

  const commands: Command[] = [
    { id: 'tab.new', title: 'New tab', group: 'Tabs', keys: 'Mod+T', run: () => (ws.addTab(), emit('facet:focus-url')) },
    { id: 'tab.close', title: 'Close tab', group: 'Tabs', keys: 'Mod+W', run: () => ws.closeTab(tab.id) },
    { id: 'nav.focus-url', title: 'Focus address bar', group: 'Navigate', keys: 'Mod+L', run: () => emit('facet:focus-url') },
    {
      id: 'nav.open-file',
      title: 'Open HTML file…',
      group: 'Navigate',
      keys: 'Mod+O',
      run: () => void bridge.pickHtml().then((path) => path && navigate(tab.id, `file://${path}`))
    },
    { id: 'nav.reload', title: 'Reload all devices', group: 'Navigate', keys: 'Mod+R', run: () => reload(tab.id) },
    { id: 'nav.hard-reload', title: 'Hard reload (skip cache)', group: 'Navigate', keys: 'Mod+Shift+R', run: () => reload(tab.id, true) },
    { id: 'nav.back', title: 'Back', group: 'Navigate', keys: 'Mod+[', run: () => goHistory(tab.id, -1) },
    { id: 'nav.forward', title: 'Forward', group: 'Navigate', keys: 'Mod+]', run: () => goHistory(tab.id, 1) },
    { id: 'bookmark.toggle', title: 'Bookmark this page', group: 'Navigate', keys: 'Mod+D', run: () => tab.url && ws.toggleBookmark(tab.url, tab.title), active: ws.bookmarks.some((b) => b.url === tab.url) },
    {
      id: 'compare.toggle',
      title: tab.compareUrl ? 'Stop comparing URLs' : 'Compare with another URL…',
      group: 'Navigate',
      run: () => (tab.compareUrl ? setCompare(tab.id, null) : emit('facet:compare'))
    },

    { id: 'view.palette', title: 'Command palette', group: 'View', keys: 'Mod+K', run: () => rt.set({ modal: rt.modal === 'palette' ? null : 'palette' }) },
    { id: 'view.panel', title: 'Toggle side panel', group: 'View', keys: 'Mod+J', run: () => set({ panelOpen: !settings.panelOpen }), active: settings.panelOpen },
    { id: 'view.zoom-in', title: 'Zoom in', group: 'View', keys: 'Mod+=', run: () => zoomBy(1.15) },
    { id: 'view.zoom-out', title: 'Zoom out', group: 'View', keys: 'Mod+-', run: () => zoomBy(1 / 1.15) },
    { id: 'view.zoom-fit', title: 'Zoom to fit', group: 'View', keys: 'Mod+0', run: () => set({ zoom: 'fit' }), active: settings.zoom === 'fit' },
    { id: 'view.zoom-100', title: 'Actual size (100%)', group: 'View', keys: 'Mod+1', run: () => set({ zoom: 1 }) },
    { id: 'view.layout', title: 'Cycle layout', group: 'View', keys: 'Mod+Shift+L', run: () => set({ layout: LAYOUTS[(LAYOUTS.indexOf(settings.layout) + 1) % LAYOUTS.length] }) },
    { id: 'view.layout.row', title: 'Layout: side by side', group: 'View', run: () => set({ layout: 'row' }), active: settings.layout === 'row' },
    { id: 'view.layout.wrap', title: 'Layout: wrap', group: 'View', run: () => set({ layout: 'wrap' }), active: settings.layout === 'wrap' },
    { id: 'view.layout.focus', title: 'Layout: one device at a time', group: 'View', run: () => set({ layout: 'focus' }), active: settings.layout === 'focus' },
    { id: 'view.frames', title: 'Device frames', group: 'View', keys: 'Mod+Shift+F', run: () => set({ showFrames: !settings.showFrames }), active: settings.showFrames },
    { id: 'view.theme', title: `Switch to ${settings.theme === 'light' ? 'dark' : 'light'} interface`, group: 'View', run: () => set({ theme: settings.theme === 'light' ? 'dark' : 'light' }) },

    { id: 'devices.manage', title: 'Manage devices…', group: 'Devices', keys: 'Mod+Shift+M', run: () => rt.set({ modal: 'devices' }) },
    { id: 'devices.add-responsive', title: 'Add a resizable pane', group: 'Devices', keys: 'Mod+Shift+N', run: () => void addResponsivePane(tab.id) },
    { id: 'devices.rotate', title: 'Rotate all devices', group: 'Devices', keys: 'Mod+Alt+R', run: () => ws.rotateAll(tab.id) },

    {
      id: 'tools.color-scheme',
      title: 'Toggle light / dark colour scheme',
      group: 'Emulate',
      keys: 'Mod+Shift+D',
      run: emu({ colorScheme: tab.emulation.colorScheme === 'dark' ? 'light' : 'dark' }),
      active: tab.emulation.colorScheme === 'dark'
    },
    { id: 'emulate.scheme-system', title: 'Colour scheme: follow system', group: 'Emulate', run: emu({ colorScheme: 'system' }), active: tab.emulation.colorScheme === 'system' },
    { id: 'emulate.reduced-motion', title: 'Reduced motion', group: 'Emulate', run: emu({ reducedMotion: !tab.emulation.reducedMotion }), active: tab.emulation.reducedMotion },
    { id: 'emulate.forced-colors', title: 'Forced colours (high contrast)', group: 'Emulate', run: emu({ forcedColors: !tab.emulation.forcedColors }), active: tab.emulation.forcedColors },
    { id: 'emulate.print', title: 'Print stylesheet', group: 'Emulate', run: emu({ media: tab.emulation.media === 'print' ? 'screen' : 'print' }), active: tab.emulation.media === 'print' },
    ...(['online', 'fast4g', 'slow4g', '3g', 'offline'] as NetworkProfile[]).map((network) => ({
      id: `emulate.network.${network}`,
      title: `Network: ${{ online: 'no throttling', fast4g: 'Fast 4G', slow4g: 'Slow 4G', '3g': '3G', offline: 'offline' }[network]}`,
      group: 'Emulate',
      run: emu({ network }),
      active: tab.emulation.network === network
    })),
    ...(['none', 'blurredVision', 'reducedContrast', 'achromatopsia', 'deuteranopia', 'protanopia', 'tritanopia'] as Vision[]).map((vision) => ({
      id: `emulate.vision.${vision}`,
      title: `Vision: ${vision === 'none' ? 'normal' : vision.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      group: 'Emulate',
      run: emu({ vision }),
      active: tab.emulation.vision === vision
    })),

    {
      id: 'tools.sync',
      title: 'Mirror interactions across devices',
      group: 'Tools',
      keys: 'Mod+Shift+Y',
      run: () => set({ sync: { scroll: !syncOn, click: !syncOn, input: !syncOn, nav: !syncOn } }),
      active: syncOn
    },
    { id: 'tools.touch', title: 'Simulate touch gestures with the mouse', group: 'Tools', run: () => set({ touchGestures: !settings.touchGestures }), active: settings.touchGestures },
    { id: 'tools.scroll-top', title: 'Scroll all devices to top', group: 'Tools', keys: 'Mod+Up', run: () => scrollAll(tab.id, 0) },
    { id: 'tools.inspect', title: 'Compare an element across devices', group: 'Tools', keys: 'Mod+I', run: () => setInspecting(tab.id, !rt.inspecting), active: rt.inspecting },
    { id: 'tools.audit', title: 'Run all audits', group: 'Tools', keys: 'Mod+Shift+A', run: () => (set({ panelOpen: true }), void runAllAudits(tab.id)) },
    { id: 'tools.screenshot-all', title: 'Screenshot all devices', group: 'Capture', keys: 'Mod+Shift+S', run: () => void captureTab(tab.id) },
    { id: 'tools.screenshot-full-all', title: 'Full-page screenshot of all devices', group: 'Capture', keys: 'Mod+Alt+S', run: () => void captureTab(tab.id, { fullPage: true }) },
    { id: 'tools.studio', title: 'Screenshot studio (composite image)', group: 'Capture', keys: 'Mod+Shift+P', run: () => void openStudio(tab.id) },
    {
      id: 'tools.devtools',
      title: 'Open DevTools for focused device',
      group: 'Tools',
      keys: 'Mod+Alt+I',
      run: () => void bridge.devtools((rt.activeViewId && tab.panes.some((p) => rt.activeViewId!.startsWith(p.id)) ? rt.activeViewId : tab.panes[0]?.id) ?? '')
    },
    { id: 'tools.clear-data', title: 'Clear cookies and storage', group: 'Tools', run: () => void clearSiteData(tab.id, ['cookies', 'storage']).then(() => reload(tab.id)) },
    { id: 'tools.clear-cache', title: 'Clear cache', group: 'Tools', run: () => void clearSiteData(tab.id, ['cache']) },

    { id: 'app.settings', title: 'Settings…', group: 'App', keys: 'Mod+,', run: () => rt.set({ modal: 'settings' }) },
    { id: 'app.shortcuts', title: 'Keyboard shortcuts', group: 'App', keys: 'Mod+/', run: () => rt.set({ modal: 'shortcuts' }) }
  ]

  for (const panel of PANEL_TABS) {
    commands.push({ id: `panel.${panel.id}`, title: `Open panel: ${panel.label}`, group: 'Panels', run: () => set({ panelOpen: true, panelTab: panel.id }), active: settings.panelOpen && settings.panelTab === panel.id })
  }
  for (const overlay of OVERLAYS) {
    commands.push({ id: `overlay.${overlay.id}`, title: `Overlay: ${overlay.name}`, group: 'Overlays', run: () => ws.toggleOverlay(tab.id, overlay.id), active: tab.overlays.includes(overlay.id) })
  }
  for (const suite of allSuites(ws.suites)) {
    commands.push({ id: `suite.${suite.id}`, title: `Devices: ${suite.name}`, group: 'Devices', run: () => ws.setDevices(tab.id, suite.deviceIds) })
  }
  return commands
}

export function runCommand(id: string): void {
  buildCommands()
    .find((c) => c.id === id)
    ?.run()
}
