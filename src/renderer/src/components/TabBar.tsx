import { Globe, Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { displayUrl } from '@shared/urls'
import { emit } from '@/lib/commands'
import { useRuntime } from '@/store/runtime'
import { useWorkspace } from '@/store/workspace'
import { cx } from './ui'

export function TabBar(): ReactNode {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const platform = useWorkspace((s) => s.info?.platform)
  // A joined string keeps the selector's result stable between unrelated store updates.
  const loading = useRuntime((s) => tabs.filter((t) => t.panes.some((p) => s.views[p.id]?.loading)).map((t) => t.id).join(','))
  const ws = useWorkspace.getState()

  return (
    <div className={cx('tabbar', platform === 'darwin' && 'mac')}>
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={cx('tab', tab.id === activeTabId && 'on')}
            onClick={() => ws.setActiveTab(tab.id)}
            onKeyDown={(e) => e.key === 'Enter' && ws.setActiveTab(tab.id)}
            onAuxClick={(e) => e.button === 1 && ws.closeTab(tab.id)}
            title={tab.url}
          >
            {loading.split(',').includes(tab.id) ? <span className="spinner" /> : tab.favicon ? <img src={tab.favicon} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <Globe size={13} />}
            <span className="tab-title">{tab.title || (tab.url ? displayUrl(tab.url) : 'New tab')}</span>
            {tab.compareUrl ? <span className="tab-tag">A/B</span> : null}
            <button
              type="button"
              className="tab-close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                ws.closeTab(tab.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="tab-new"
          title="New tab"
          aria-label="New tab"
          onClick={() => {
            ws.addTab()
            emit('facet:focus-url')
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="tabbar-drag" />
      <div className="brand">
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path d="M10 1 2 6v8l8 5 8-5V6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M2 6l8 5 8-5M10 11v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        Facet
      </div>
    </div>
  )
}
