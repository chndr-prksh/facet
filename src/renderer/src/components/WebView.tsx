import { RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { EmulationSpec, PageMetrics, SyncEvent, Vitals } from '@shared/types'
import { pickElement, setInspecting } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import { engageTouch } from '@/lib/touch'
import { attachView, broadcastSync, detachView, highlight, onNavigated, rememberSpec, resetInjected, settleView, syncInjected, viewIdOf, viewsOfTab, type Side, type ViewRef } from '@/lib/views'
import { levelOf, useRuntime, useView } from '@/store/runtime'
import { useWorkspace } from '@/store/workspace'

interface Props {
  tabId: string
  paneId: string
  side: Side
  partition: string
  url: string
  spec: EmulationSpec
  width: number
  height: number
  zoom: number
  overlays: string[]
  liveCss: string
  isPrimary: boolean
}

/** net error codes worth one automatic retry: failed, timed out, network changed, connection closed/reset/failed, empty response. */
const TRANSIENT = new Set([-2, -7, -21, -100, -101, -104, -118, -324])

/** Changes to these need a reload before page scripts can observe them. */
const reloadKey = (s: EmulationSpec): string => JSON.stringify([s.userAgent, s.touch, s.mobile, s.disableJs, s.locale])

export function WebView(props: Props): ReactNode {
  const { tabId, paneId, side, partition, width, height, zoom } = props
  const viewId = viewIdOf(paneId, side)
  const hostRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const appliedReloadKey = useRef('')
  const view = useView(viewId)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ref: ViewRef = { viewId, paneId, tabId, side }
    const rt = useRuntime.getState
    const webview = document.createElement('webview') as Electron.WebviewTag
    webview.setAttribute('partition', partition)
    webview.setAttribute('allowpopups', '')
    webview.setAttribute('src', 'about:blank')
    webview.className = 'webview'
    let registered = false
    let disposed = false
    /** The URL that has already had its one automatic retry. */
    let retried = ''

    rt().patchView(viewId, { ready: false, loading: false, url: '', title: '', error: undefined, vitals: {}, metrics: undefined, errors: 0, warnings: 0 })
    attachView(ref, webview)

    const on = <K extends keyof HTMLElementEventMap>(type: K | string, fn: (e: never) => void): void => webview.addEventListener(type, fn as EventListener)

    on('dom-ready', async () => {
      if (disposed) return
      if (!registered) {
        // First ready is about:blank. Emulation goes on before the real page
        // loads so its very first render already sees the right device.
        registered = true
        await bridge.registerPane(viewId, webview.getWebContentsId())
        rememberSpec(viewId, latest.current.spec)
        const warnings = await bridge.emulate(viewId, latest.current.spec)
        appliedReloadKey.current = reloadKey(latest.current.spec)
        if (disposed) return
        rt().patchView(viewId, { ready: true, emulationWarnings: warnings })
        if (latest.current.url) webview.loadURL(latest.current.url).catch(() => {})
        return
      }
      resetInjected(viewId)
      void syncInjected(viewId, latest.current.overlays, latest.current.liveCss)
      if (rt().inspecting) webview.send('facet:inspect', true)
    })

    // The initial about:blank load is plumbing, not something to show a spinner for.
    on('did-start-loading', () => registered && rt().patchView(viewId, { loading: true }))
    on('did-stop-loading', () => {
      if (!registered) return
      settleView(viewId)
      rt().patchView(viewId, { loading: false, canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward(), title: webview.getTitle() })
    })
    on('did-navigate', (e: Electron.DidNavigateEvent) => {
      if (e.url === 'about:blank') return
      retried = ''
      rt().patchView(viewId, { url: e.url, error: undefined, errors: 0, warnings: 0, vitals: {}, metrics: undefined })
      onNavigated(ref, e.url, false)
    })
    on('did-navigate-in-page', (e: Electron.DidNavigateInPageEvent) => {
      if (!e.isMainFrame) return
      rt().patchView(viewId, { url: e.url })
      onNavigated(ref, e.url, true)
    })
    on('page-title-updated', (e: Electron.PageTitleUpdatedEvent) => {
      rt().patchView(viewId, { title: e.title })
      if (latest.current.isPrimary && side === 'a') useWorkspace.getState().updateTab(tabId, { title: e.title })
    })
    on('page-favicon-updated', (e: Electron.PageFaviconUpdatedEvent) => {
      if (latest.current.isPrimary && side === 'a') useWorkspace.getState().updateTab(tabId, { favicon: e.favicons[0] })
    })
    on('did-fail-load', (e: Electron.DidFailLoadEvent) => {
      // -3 is ERR_ABORTED: a navigation superseded by another, not a failure.
      if (!e.isMainFrame || e.errorCode === -3) return
      // Several panes hitting one host at the same moment can get a connection
      // dropped. Those failures are transient, so try once more before
      // showing an error.
      if (TRANSIENT.has(e.errorCode) && retried !== e.validatedURL) {
        retried = e.validatedURL
        window.setTimeout(() => !disposed && webview.loadURL(e.validatedURL).catch(() => {}), 700 + Math.random() * 600)
        return
      }
      rt().patchView(viewId, { loading: false, error: { code: e.errorCode, description: e.errorDescription, url: e.validatedURL } })
    })
    on('render-process-gone', () => rt().patchView(viewId, { loading: false, error: { code: 0, description: 'The page crashed', url: webview.getURL() } }))
    on('console-message', (e: Electron.ConsoleMessageEvent) => {
      // Electron prints its own advisories into every guest; they are not the page's.
      if (!registered || !e.message || e.message.startsWith('%cElectron Security Warning')) return
      rt().log({ tabId, paneId: viewId, level: levelOf(e.level), message: e.message, source: e.sourceId, line: e.line })
    })
    on('update-target-url', (e: Electron.UpdateTargetUrlEvent) => rt().set({ hoverUrl: e.url }))
    on('focus', () => rt().set({ activeViewId: viewId }))

    on('ipc-message', (e: Electron.IpcMessageEvent) => {
      const payload = e.args[0]
      switch (e.channel) {
        case 'facet:sync':
          return broadcastSync(ref, payload as SyncEvent)
        case 'facet:active':
          if (rt().activeViewId !== viewId) rt().set({ activeViewId: viewId })
          return
        case 'facet:metrics':
          return rt().patchView(viewId, { metrics: payload as PageMetrics })
        case 'facet:vitals':
          return rt().patchView(viewId, { vitals: { ...(payload as Vitals) } })
        case 'facet:pinch': {
          const ws = useWorkspace.getState()
          const current = typeof ws.settings.zoom === 'number' ? ws.settings.zoom : latest.current.zoom
          const next = Math.min(1.5, Math.max(0.15, current * (1 - (payload as number) * 0.01)))
          return ws.setSettings({ zoom: Math.round(next * 100) / 100 })
        }
        case 'facet:inspect-hover':
          for (const other of viewsOfTab(tabId)) if (other.viewId !== viewId) highlight(other.viewId, payload as string, { hold: true })
          return
        case 'facet:inspect-pick':
          return pickElement(tabId, viewId, (payload as { selector: string }).selector)
        case 'facet:inspect-cancel':
          return setInspecting(tabId, false)
      }
    })

    host.appendChild(webview)

    return () => {
      disposed = true
      detachView(viewId)
      void bridge.unregisterPane(viewId)
      rt().dropView(viewId)
      webview.remove()
    }
  }, [viewId, paneId, tabId, side, partition])

  /* Push emulation changes to the live guest. */
  const specJson = JSON.stringify(props.spec)
  useEffect(() => {
    if (!view.ready) return
    let cancelled = false
    rememberSpec(viewId, props.spec)
    void bridge.emulate(viewId, props.spec).then((warnings) => {
      if (cancelled) return
      if (warnings.length) useRuntime.getState().patchView(viewId, { emulationWarnings: warnings })
      const key = reloadKey(props.spec)
      if (appliedReloadKey.current && appliedReloadKey.current !== key) {
        const webview = hostRef.current?.querySelector('webview') as Electron.WebviewTag | null
        if (webview && /^(https?|file):/.test(webview.getURL())) webview.reload()
      }
      appliedReloadKey.current = key
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specJson, view.ready, viewId])

  const overlayKey = props.overlays.join(',')
  useEffect(() => {
    if (view.ready) void syncInjected(viewId, props.overlays, props.liveCss)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey, props.liveCss, view.ready, viewId])

  const touchGestures = useWorkspace((s) => s.settings.touchGestures)

  return (
    <div
      className="wv-wrap"
      style={{ width: width * zoom, height: height * zoom }}
      onMouseEnter={(e) => touchGestures && props.spec.touch && engageTouch(viewId, e.currentTarget)}
    >
      <div ref={hostRef} className="wv-scale" style={{ width, height, transform: `scale(${zoom})` }} />
      {view.loading ? <div className="wv-progress" /> : null}
      {view.error ? (
        <div className="wv-error">
          <TriangleAlert size={22} />
          <strong>{view.error.description.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase() || 'failed to load'}</strong>
          <span>{view.error.url}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const webview = hostRef.current?.querySelector('webview') as Electron.WebviewTag | null
              webview?.loadURL(view.error!.url).catch(() => {})
            }}
          >
            <RotateCw size={13} /> Retry
          </button>
        </div>
      ) : null}
      {!props.url && view.ready ? <div className="wv-blank">Enter a URL above</div> : null}
    </div>
  )
}
