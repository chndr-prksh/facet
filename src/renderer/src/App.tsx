import { useEffect, type ReactNode } from 'react'
import type { PaneEvent } from '@shared/types'
import { Chrome } from './components/Chrome'
import { AuthPrompt, DeviceManager, Palette, SettingsModal, Shortcuts } from './components/Modals'
import { SidePanel } from './components/SidePanel'
import { Stage } from './components/Stage'
import { Studio } from './components/Studio'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { captureTab, setInspecting } from './lib/actions'
import { handleAgent } from './lib/agent'
import { bridge } from './lib/bridge'
import { emit, runCommand } from './lib/commands'
import { releaseTouch } from './lib/touch'
import { exec, goHistory, lastSpec, navigate, refOf, refreshStyles, reload, sendToView, viewsOfTab } from './lib/views'
import { toast, useRuntime } from './store/runtime'
import { activeTab, useActiveTab, useWorkspace } from './store/workspace'

function onPaneEvent(event: PaneEvent): void {
  const ref = refOf(event.paneId)
  if (!ref) return
  const rt = useRuntime.getState()

  if (event.type === 'network') {
    rt.log({ tabId: ref.tabId, paneId: event.paneId, level: 'network', message: `${event.status || 'Failed'} ${event.url ?? ''}${event.status ? '' : ` (${event.message})`}`.trim() })
    return
  }
  if (event.type === 'detached') {
    // Another debugger client took the session. Re-applying re-attaches and restores emulation.
    const spec = lastSpec(event.paneId)
    if (spec) void bridge.emulate(event.paneId, spec)
    return
  }
  switch (event.action) {
    case 'back':
      return goHistory(ref.tabId, -1)
    case 'forward':
      return goHistory(ref.tabId, 1)
    case 'reload':
      return reload(ref.tabId)
    case 'open-tab':
      if (event.url) useWorkspace.getState().addTab(event.url)
      return
    case 'screenshot':
      return void captureTab(ref.tabId, { paneId: ref.paneId })
    case 'screenshot-full':
      return void captureTab(ref.tabId, { paneId: ref.paneId, fullPage: true })
    case 'inspect':
      return sendToView(event.paneId, 'facet:pick-at', { x: event.x, y: event.y })
  }
}

const fileDir = (url: string): string | undefined => {
  if (!url.startsWith('file://')) return undefined
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/\/[^/]*$/, '') || undefined
  } catch {
    return undefined
  }
}

export function App(): ReactNode {
  const hydrated = useWorkspace((s) => s.hydrated)
  const tabs = useWorkspace((s) => s.tabs)
  const settings = useWorkspace((s) => s.settings)
  const modal = useRuntime((s) => s.modal)
  const tab = useActiveTab()

  useEffect(() => {
    void useWorkspace
      .getState()
      .hydrate()
      .then(() => bridge.ready())
      .then((url) => {
        if (url) navigate(activeTab().id, url)
      })
    const offs = [
      bridge.onCommand(runCommand),
      bridge.onOpenUrl((url) => {
        const ws = useWorkspace.getState()
        // Reuse an empty tab instead of piling up new ones.
        if (activeTab().url) ws.addTab(url)
        else navigate(activeTab().id, url)
      }),
      bridge.onPaneEvent(onPaneEvent),
      bridge.onAgentRequest((req) => {
        handleAgent(req).then(
          (content) => bridge.agentRespond(req.id, true, content),
          (err: Error) => bridge.agentRespond(req.id, false, err.message)
        )
      }),
      bridge.onLiveChange(({ key, kind }) => {
        if (kind === 'css') for (const ref of viewsOfTab(key)) void exec(ref.viewId, refreshStyles).catch(() => {})
        else reload(key)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  /* Interface theme. 'system' tracks the OS live. */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  useEffect(() => {
    if (!hydrated) return
    void bridge.setMcp(settings.mcpEnabled, settings.mcpPort).then((status) => {
      useRuntime.getState().set({ mcp: status })
      if (status.error) toast(`MCP server: ${status.error}`, 'error')
    })
  }, [hydrated, settings.mcpEnabled, settings.mcpPort])

  useEffect(() => {
    if (hydrated) void bridge.setRuntime({ ignoreCertErrors: settings.ignoreCertErrors, popups: settings.popups })
  }, [hydrated, settings.ignoreCertErrors, settings.popups])

  useEffect(() => {
    if (!settings.touchGestures) releaseTouch()
  }, [settings.touchGestures])

  /* Live reload: an explicit folder, or the folder of a local file being viewed. */
  const watchKey = tabs.map((t) => `${t.id}=${t.watchDir ?? fileDir(t.url) ?? ''}`).join('|')
  useEffect(() => {
    if (!hydrated) return
    const watched: string[] = []
    for (const t of useWorkspace.getState().tabs) {
      const dir = t.watchDir ?? fileDir(t.url)
      if (dir) {
        watched.push(t.id)
        void bridge.watch(t.id, dir)
      }
    }
    return () => watched.forEach((id) => void bridge.unwatch(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, watchKey])

  /* The picker belongs to one tab; leaving it ends the pick. */
  useEffect(() => {
    return () => {
      if (useRuntime.getState().inspecting) setInspecting(tab.id, false)
    }
  }, [tab.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && useRuntime.getState().inspecting) setInspecting(activeTab().id, false)
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        emit('facet:focus-url')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!hydrated) return <div className="app booting" />

  return (
    <div className="app">
      <TabBar />
      <Toolbar tab={tab} />
      <div className="main">
        <div className="stages">
          {tabs.map((t) => (
            <Stage key={t.id} tab={t} active={t.id === tab.id} />
          ))}
        </div>
        {settings.panelOpen ? <SidePanel tab={tab} /> : null}
      </div>
      <Chrome.StatusBar tab={tab} />
      {modal === 'palette' ? <Palette /> : null}
      {modal === 'devices' ? <DeviceManager /> : null}
      {modal === 'settings' ? <SettingsModal /> : null}
      {modal === 'shortcuts' ? <Shortcuts /> : null}
      {modal === 'studio' ? <Studio /> : null}
      <AuthPrompt />
      <Chrome.Toasts />
    </div>
  )
}
