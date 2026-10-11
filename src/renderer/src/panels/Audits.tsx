import { ExternalLink, Play, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Issue, Tab } from '@shared/types'
import { runA11y, runIssues, viewLabel } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import { highlight, primaryViewId, viewsOfTab } from '@/lib/views'
import { useRuntime } from '@/store/runtime'
import { Empty, Segmented, Sev, cx } from '@/components/ui'

const ORDER = { error: 0, warn: 1, info: 2 } as const
const ago = (time: number): string => {
  const seconds = Math.round((Date.now() - time) / 1000)
  return seconds < 5 ? 'just now' : seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`
}

function IssueRow({ issue, devices, onClick }: { issue: Issue; devices?: string[]; onClick: () => void }): ReactNode {
  return (
    <button type="button" className="issue" onClick={onClick} disabled={!issue.selector} title={issue.selector ? 'Show on page' : undefined}>
      <Sev level={issue.severity} />
      <span className="issue-body">
        <span className="issue-title">{issue.title}</span>
        {issue.detail ? <code>{issue.detail}</code> : null}
        {issue.hint ? <span className="issue-hint">{issue.hint}</span> : null}
        {devices ? (
          <span className="chip-wrap">
            {devices.map((d) => (
              <span key={d} className="chip tiny">
                {d}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function IssuesPanel({ tab }: { tab: Tab }): ReactNode {
  const issues = useRuntime((s) => s.issues)
  const issuesAt = useRuntime((s) => s.issuesAt)
  const loaded = useRuntime((s) => tab.panes.some((p) => s.views[p.id]?.url && !s.views[p.id]?.loading))
  const [mode, setMode] = useState<'device' | 'issue'>('device')
  const [running, setRunning] = useState(false)

  const run = async (): Promise<void> => {
    setRunning(true)
    await runIssues(tab.id)
    setRunning(false)
  }

  // Audit on first open so the panel is never an empty promise.
  useEffect(() => {
    if (loaded && !issuesAt) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const views = viewsOfTab(tab.id, 'a').filter((r) => issues[r.viewId])
  const all = views.flatMap((r) => issues[r.viewId].map((issue) => ({ issue, viewId: r.viewId })))
  const count = (severity: Issue['severity']): number => all.filter((x) => x.issue.severity === severity).length

  const merged = useMemo(() => {
    const groups = new Map<string, { issue: Issue; viewIds: string[] }>()
    for (const { issue, viewId } of all) {
      // The same element failing the same rule on several devices is one problem.
      const key = `${issue.rule}|${issue.selector ?? issue.title}`
      const group = groups.get(key)
      if (group) group.viewIds.push(viewId)
      else groups.set(key, { issue, viewIds: [viewId] })
    }
    return [...groups.values()].sort((a, b) => ORDER[a.issue.severity] - ORDER[b.issue.severity] || b.viewIds.length - a.viewIds.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, tab.panes])

  if (!tab.url) return <Empty icon={<Smartphone size={22} />} title="No page loaded">Open a page to check it for responsive problems.</Empty>

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <button type="button" className="btn primary" onClick={() => void run()} disabled={running}>
          <Play size={12} /> {running ? 'Checking…' : 'Check all devices'}
        </button>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'device', label: 'By device' }, { value: 'issue', label: 'By issue' }]} />
      </div>
      {issuesAt ? (
        <div className="summary">
          <span className="stat red">
            <b>{count('error')}</b> errors
          </span>
          <span className="stat amber">
            <b>{count('warn')}</b> warnings
          </span>
          <span className="stat">
            <b>{count('info')}</b> notes
          </span>
          <span className="dim grow right">{ago(issuesAt)}</span>
        </div>
      ) : null}
      <div className="panel-scroll">
        {!issuesAt ? (
          <Empty title="Not checked yet">Finds horizontal overflow, small tap targets, tiny text, iOS zoom traps and more, on every device at once.</Empty>
        ) : all.length === 0 ? (
          <Empty icon={<ShieldCheck size={22} />} title="No responsive problems found">Checked {views.length} devices.</Empty>
        ) : mode === 'device' ? (
          views.map((ref) => {
            const list = [...issues[ref.viewId]].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
            return (
              <section key={ref.viewId} className="group">
                <h4>
                  {viewLabel(ref.viewId)}
                  <span className={cx('count', list.some((i) => i.severity === 'error') && 'red')}>{list.length || '✓'}</span>
                </h4>
                {list.length === 0 ? <p className="dim pad">Nothing to fix here.</p> : list.map((issue, i) => <IssueRow key={i} issue={issue} onClick={() => highlight(ref.viewId, issue.selector, { scroll: true, color: '#ff5c5c' })} />)}
              </section>
            )
          })
        ) : (
          merged.map(({ issue, viewIds }, i) => (
            <IssueRow key={i} issue={issue} devices={viewIds.map(viewLabel)} onClick={() => viewIds.forEach((id) => highlight(id, issue.selector, { scroll: true, color: '#ff5c5c' }))} />
          ))
        )}
      </div>
    </div>
  )
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const

export function A11yPanel({ tab }: { tab: Tab }): ReactNode {
  const results = useRuntime((s) => s.a11y)
  const views = viewsOfTab(tab.id, 'a')
  const [viewId, setViewId] = useState(primaryViewId(tab.id) ?? '')
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const target = views.some((v) => v.viewId === viewId) ? viewId : (views[0]?.viewId ?? '')
  const result = results[target]

  const run = async (): Promise<void> => {
    setRunning(true)
    await runA11y(tab.id, target)
    setRunning(false)
  }

  if (!tab.url) return <Empty icon={<ShieldCheck size={22} />} title="No page loaded">Open a page to audit its accessibility.</Empty>
  const violations = [...(result?.violations ?? [])].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact])

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <button type="button" className="btn primary" onClick={() => void run()} disabled={running || !target}>
          <Play size={12} /> {running ? 'Auditing…' : 'Run axe audit'}
        </button>
        <select className="select" value={target} onChange={(e) => setViewId(e.target.value)} aria-label="Device to audit">
          {views.map((v) => (
            <option key={v.viewId} value={v.viewId}>
              {viewLabel(v.viewId)}
            </option>
          ))}
        </select>
      </div>
      {result && !result.error ? (
        <div className="summary">
          <span className="stat red">
            <b>{violations.length}</b> failing rules
          </span>
          <span className="stat">
            <b>{result.passes}</b> passing
          </span>
          <span className="stat amber">
            <b>{result.incomplete}</b> need review
          </span>
        </div>
      ) : null}
      <div className="panel-scroll">
        {!result ? (
          <Empty title="Not audited yet">Runs axe-core against WCAG 2.2 A and AA. Some failures only appear at certain viewports, so audit the device you care about.</Empty>
        ) : result.error ? (
          <Empty title="Audit failed">{result.error}</Empty>
        ) : violations.length === 0 ? (
          <Empty icon={<ShieldCheck size={22} />} title="No automated failures">Automated checks catch roughly a third of accessibility problems. Keyboard and screen-reader testing still matter.</Empty>
        ) : (
          violations.map((v) => (
            <section key={v.id} className={cx('a11y', open === v.id && 'open')}>
              <button type="button" className="a11y-head" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
                <span className={cx('impact', v.impact)}>{v.impact}</span>
                <span className="grow">{v.help}</span>
                <span className="count">{v.nodes.length}</span>
              </button>
              {open === v.id ? (
                <div className="a11y-body">
                  <p>{v.description}</p>
                  <p className="tags">
                    {v.wcag.map((t) => (
                      <span key={t} className="chip tiny">
                        {t}
                      </span>
                    ))}
                    <button type="button" className="link" onClick={() => void bridge.openExternal(v.helpUrl)}>
                      How to fix <ExternalLink size={11} />
                    </button>
                  </p>
                  {v.nodes.map((node, i) => (
                    <button key={i} type="button" className="node" onClick={() => highlight(target, node.selector, { scroll: true, color: '#ff5c5c' })}>
                      <code>{node.html}</code>
                      {node.fix ? <span>{node.fix}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
