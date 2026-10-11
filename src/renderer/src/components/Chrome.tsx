import { Bot, CircleAlert, CircleCheck, Info, Link2, Link2Off, MoveHorizontal, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tab } from '@shared/types'
import { useRuntime } from '@/store/runtime'
import { useWorkspace } from '@/store/workspace'
import { cx } from './ui'

const ms = (value?: number): string => (value === undefined ? '–' : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`)

function StatusBar({ tab }: { tab: Tab }): ReactNode {
  const hoverUrl = useRuntime((s) => s.hoverUrl)
  const busy = useRuntime((s) => s.busy)
  const inspecting = useRuntime((s) => s.inspecting)
  const overflowing = useRuntime((s) => tab.panes.filter((p) => s.views[p.id]?.metrics?.overflowX).length)
  const errors = useRuntime((s) => tab.panes.reduce((n, p) => n + (s.views[p.id]?.errors ?? 0), 0))
  const vitals = useRuntime((s) => s.views[tab.panes[0]?.id]?.vitals)
  const settings = useWorkspace((s) => s.settings)
  const chrome = useWorkspace((s) => s.info?.chrome.split('.')[0])
  const set = useWorkspace.getState().setSettings
  const syncOn = settings.sync.scroll || settings.sync.click || settings.sync.input || settings.sync.nav

  return (
    <footer className="status">
      <span className="status-main">{busy ?? (inspecting ? 'Click any element to compare it across devices. Esc to cancel.' : hoverUrl)}</span>
      {overflowing > 0 ? (
        <button type="button" className="status-item red" onClick={() => set({ panelOpen: true, panelTab: 'issues' })} title="These devices scroll sideways">
          <MoveHorizontal size={12} /> {overflowing} overflowing
        </button>
      ) : null}
      {errors > 0 ? (
        <button type="button" className="status-item red" onClick={() => set({ panelOpen: true, panelTab: 'console' })}>
          <CircleAlert size={12} /> {errors} {errors === 1 ? 'error' : 'errors'}
        </button>
      ) : null}
      {vitals?.lcp !== undefined ? (
        <span className="status-item" title="Measured on the first device">
          LCP {ms(vitals.lcp)} · CLS {vitals.cls?.toFixed(2) ?? '0.00'}
          {vitals.inp !== undefined ? ` · INP ${ms(vitals.inp)}` : ''}
        </span>
      ) : null}
      <span className={cx('status-item', !syncOn && 'dim')}>
        {syncOn ? <Link2 size={12} /> : <Link2Off size={12} />} {syncOn ? 'Mirroring' : 'Mirroring off'}
      </span>
      {settings.mcpEnabled ? (
        <span className="status-item accent" title={`MCP server on port ${settings.mcpPort}`}>
          <Bot size={12} /> MCP
        </span>
      ) : null}
      <span className="status-item dim">Chromium {chrome}</span>
    </footer>
  )
}

function Toasts(): ReactNode {
  const toasts = useRuntime((s) => s.toasts)
  const dismiss = useRuntime.getState().dismissToast
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', t.kind)}>
          {t.kind === 'success' ? <CircleCheck size={15} /> : t.kind === 'error' ? <CircleAlert size={15} /> : <Info size={15} />}
          <span>{t.text}</span>
          {t.action ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

export const Chrome = { StatusBar, Toasts }
