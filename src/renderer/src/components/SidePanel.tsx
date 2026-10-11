import { Accessibility, Braces, Bug, Crosshair, Database, ListTree, Ruler, Search, Terminal, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PanelTab, Tab } from '@shared/types'
import { A11yPanel, IssuesPanel } from '@/panels/Audits'
import { BreakpointsPanel, OutlinePanel, SeoPanel } from '@/panels/Document'
import { ConsolePanel, InjectPanel, InspectPanel, StoragePanel } from '@/panels/Tools'
import { useRuntime } from '@/store/runtime'
import { useWorkspace } from '@/store/workspace'
import { IconButton, cx } from './ui'

const TABS: Array<{ id: PanelTab; label: string; icon: ReactNode }> = [
  { id: 'issues', label: 'Issues', icon: <Bug size={14} /> },
  { id: 'a11y', label: 'A11y', icon: <Accessibility size={14} /> },
  { id: 'seo', label: 'SEO', icon: <Search size={14} /> },
  { id: 'outline', label: 'Outline', icon: <ListTree size={14} /> },
  { id: 'inspect', label: 'Compare', icon: <Crosshair size={14} /> },
  { id: 'console', label: 'Console', icon: <Terminal size={14} /> },
  { id: 'breakpoints', label: 'Breaks', icon: <Ruler size={14} /> },
  { id: 'storage', label: 'Storage', icon: <Database size={14} /> },
  { id: 'inject', label: 'Inject', icon: <Braces size={14} /> }
]

export function SidePanel({ tab }: { tab: Tab }): ReactNode {
  const panelTab = useWorkspace((s) => s.settings.panelTab)
  const width = useWorkspace((s) => s.settings.panelWidth)
  const ws = useWorkspace.getState()
  const issueCount = useRuntime((s) => tab.panes.reduce((n, p) => n + (s.issues[p.id]?.filter((i) => i.severity !== 'info').length ?? 0), 0))
  const errorCount = useRuntime((s) => tab.panes.reduce((n, p) => n + (s.views[p.id]?.errors ?? 0), 0))
  const a11yCount = useRuntime((s) => s.a11y[tab.panes[0]?.id]?.violations.length ?? 0)
  const counts: Partial<Record<PanelTab, number>> = { issues: issueCount, console: errorCount, a11y: a11yCount }

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const origin = { x: e.clientX, width }
    document.body.classList.add('dragging')
    const move = (ev: PointerEvent): void => ws.setSettings({ panelWidth: Math.round(Math.min(900, Math.max(300, origin.width + origin.x - ev.clientX))) })
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      document.body.classList.remove('dragging')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  return (
    <aside className="side" style={{ width }} aria-label="Audits and tools">
      <div className="side-resize" onPointerDown={startResize} />
      <nav className="side-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === panelTab} className={cx(t.id === panelTab && 'on')} onClick={() => ws.setSettings({ panelTab: t.id })} title={t.label}>
            {t.icon}
            <span>{t.label}</span>
            {counts[t.id] ? <i>{counts[t.id]}</i> : null}
          </button>
        ))}
        <IconButton size="sm" title="Close panel" onClick={() => ws.setSettings({ panelOpen: false })} className="side-close">
          <X size={14} />
        </IconButton>
      </nav>
      {panelTab === 'issues' ? <IssuesPanel tab={tab} /> : null}
      {panelTab === 'a11y' ? <A11yPanel tab={tab} /> : null}
      {panelTab === 'seo' ? <SeoPanel tab={tab} /> : null}
      {panelTab === 'outline' ? <OutlinePanel tab={tab} /> : null}
      {panelTab === 'inspect' ? <InspectPanel tab={tab} /> : null}
      {panelTab === 'console' ? <ConsolePanel tab={tab} /> : null}
      {panelTab === 'breakpoints' ? <BreakpointsPanel tab={tab} /> : null}
      {panelTab === 'storage' ? <StoragePanel tab={tab} /> : null}
      {panelTab === 'inject' ? <InjectPanel tab={tab} /> : null}
    </aside>
  )
}
