import { Link as LinkIcon, Plus, RefreshCw, Ruler } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { LinkCheck, Tab } from '@shared/types'
import { displayUrl, hostOf } from '@shared/urls'
import { addResponsivePane, loadBreakpoints, loadMeta, loadOutline } from '@/lib/actions'
import { bridge } from '@/lib/bridge'
import type { PageMeta } from '@/lib/scripts'
import { checkMeta } from '@/lib/seo'
import { highlight, primaryViewId } from '@/lib/views'
import { useRuntime } from '@/store/runtime'
import { deviceById, paneSize, useWorkspace } from '@/store/workspace'
import { Empty, Segmented, Sev, cx } from '@/components/ui'

/** Reloads a panel's data whenever the page behind it changes. */
function usePageData(tab: Tab, load: (tabId: string) => Promise<void>): { refresh: () => void } {
  const url = useRuntime((s) => s.views[tab.panes[0]?.id]?.url)
  const loading = useRuntime((s) => s.views[tab.panes[0]?.id]?.loading)
  useEffect(() => {
    if (url && !loading) void load(tab.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, loading, tab.id])
  return { refresh: () => void load(tab.id) }
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

function Previews({ meta }: { meta: PageMeta }): ReactNode {
  const title = meta.og.title || meta.twitter.title || meta.title || displayUrl(meta.url)
  const description = meta.og.description || meta.twitter.description || meta.description
  const image = meta.og.image || meta.twitter.image
  const host = hostOf(meta.url)
  const site = meta.og.site_name || host
  const large = meta.twitter.card === 'summary_large_image'
  const hide = (e: React.SyntheticEvent<HTMLImageElement>): void => void (e.currentTarget.style.display = 'none')

  return (
    <div className="previews">
      <figure>
        <figcaption>Google</figcaption>
        <div className="pv google">
          <div className="pv-site">
            <img src={meta.favicon} alt="" onError={hide} />
            <span>
              <b>{site}</b>
              <i>{clip(meta.canonical || meta.url, 60)}</i>
            </span>
          </div>
          <div className="pv-title">{clip(meta.title || 'Untitled', 60)}</div>
          <div className="pv-desc">{clip(meta.description || 'No meta description. Google will pick text from the page.', 158)}</div>
        </div>
      </figure>
      <figure>
        <figcaption>X {large ? '(large image)' : '(summary)'}</figcaption>
        <div className={cx('pv x', large && 'large')}>
          {image ? <img className="pv-img" src={meta.twitter.image || image} alt="" onError={hide} /> : <div className="pv-img none">No image</div>}
          <div className="pv-text">
            <i>{host}</i>
            <b>{clip(meta.twitter.title || title, 70)}</b>
            {!large ? <span>{clip(meta.twitter.description || description, 120)}</span> : null}
          </div>
        </div>
      </figure>
      <figure>
        <figcaption>Facebook · LinkedIn</figcaption>
        <div className="pv fb">
          {image ? <img className="pv-img" src={image} alt="" onError={hide} /> : <div className="pv-img none">No og:image</div>}
          <div className="pv-text">
            <i>{host.toUpperCase()}</i>
            <b>{clip(title, 88)}</b>
            <span>{clip(description, 110)}</span>
          </div>
        </div>
      </figure>
      <figure>
        <figcaption>Slack · Discord</figcaption>
        <div className="pv slack">
          <div className="pv-text">
            <i>
              <img src={meta.favicon} alt="" onError={hide} /> {site}
            </i>
            <b>{clip(title, 80)}</b>
            <span>{clip(description, 200)}</span>
          </div>
          {image ? <img className="pv-img" src={image} alt="" onError={hide} /> : null}
        </div>
      </figure>
    </div>
  )
}

export function SeoPanel({ tab }: { tab: Tab }): ReactNode {
  const meta = useRuntime((s) => s.meta)
  const { refresh } = usePageData(tab, loadMeta)
  const [view, setView] = useState<'checks' | 'previews' | 'tags'>('checks')
  if (!tab.url || !meta) return <Empty title="No page loaded">Open a page to see how search engines and link previews read it.</Empty>

  const checks = checkMeta(meta)
  const failing = checks.filter((c) => c.level !== 'ok')
  const tags: Array<[string, string]> = [
    ['title', meta.title],
    ['description', meta.description],
    ['canonical', meta.canonical],
    ['robots', meta.robots],
    ['lang', meta.lang],
    ['charset', meta.charset],
    ['viewport', meta.viewport],
    ['theme-color', meta.themeColor],
    ['manifest', meta.manifest],
    ...Object.entries(meta.og).map(([k, v]): [string, string] => [`og:${k}`, v]),
    ...Object.entries(meta.twitter).map(([k, v]): [string, string] => [`twitter:${k}`, v]),
    ...meta.icons.map((i): [string, string] => [`${i.rel}${i.sizes ? ` ${i.sizes}` : ''}`, i.href]),
    ...meta.hreflang.map((h): [string, string] => [`hreflang ${h.lang}`, h.href]),
    ...meta.jsonLd.map((j): [string, string] => ['JSON-LD', j.type])
  ]

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'checks', label: `Checks ${failing.length || ''}` }, { value: 'previews', label: 'Previews' }, { value: 'tags', label: 'All tags' }]} />
        <button type="button" className="btn ghost" onClick={refresh} title="Re-read the page">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="panel-scroll">
        {view === 'checks' ? (
          <>
            {[...checks].sort((a, b) => ['error', 'warn', 'ok'].indexOf(a.level) - ['error', 'warn', 'ok'].indexOf(b.level)).map((c, i) => (
              <div key={i} className="issue static">
                <Sev level={c.level} />
                <span className="issue-body">
                  <span className="issue-title">{c.label}</span>
                  <span className="issue-hint">{c.detail}</span>
                </span>
              </div>
            ))}
            <p className="dim pad">{meta.wordCount.toLocaleString()} words on the page.</p>
          </>
        ) : view === 'previews' ? (
          <Previews meta={meta} />
        ) : (
          <table className="kv">
            <tbody>
              {tags.filter(([, v]) => v).map(([k, v], i) => (
                <tr key={i}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function OutlinePanel({ tab }: { tab: Tab }): ReactNode {
  const outline = useRuntime((s) => s.outline)
  const { refresh } = usePageData(tab, loadOutline)
  const [view, setView] = useState<'headings' | 'landmarks' | 'links' | 'images'>('headings')
  const [checks, setChecks] = useState<Record<string, LinkCheck> | null>(null)
  const [checking, setChecking] = useState(false)
  const viewId = primaryViewId(tab.id) ?? ''
  useEffect(() => setChecks(null), [outline])

  if (!tab.url || !outline) return <Empty title="No page loaded">Open a page to see its structure.</Empty>
  const show = (selector: string): void => highlight(viewId, selector, { scroll: true })
  const missingAlt = outline.images.filter((i) => i.alt === null)
  const emptyLinks = outline.links.filter((l) => !l.text)
  const unsafe = outline.links.filter((l) => l.unsafeBlank)
  const broken = checks ? Object.values(checks).filter((c) => !c.ok) : []

  const checkLinks = async (): Promise<void> => {
    setChecking(true)
    const results = await bridge.checkLinks(outline.links.map((l) => l.href.split('#')[0]))
    setChecks(Object.fromEntries(results.map((r) => [r.url, r])))
    setChecking(false)
  }

  let previous = 0
  return (
    <div className="panel-content">
      <div className="panel-bar">
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'headings', label: `Headings ${outline.headings.length}` },
            { value: 'landmarks', label: 'Landmarks' },
            { value: 'links', label: `Links ${outline.links.length}` },
            { value: 'images', label: `Images ${outline.images.length}` }
          ]}
        />
        <button type="button" className="btn ghost" onClick={refresh} title="Re-read the page">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="panel-scroll">
        {view === 'headings' ? (
          outline.headings.length === 0 ? (
            <Empty title="No headings">Screen-reader users navigate by headings; this page gives them none.</Empty>
          ) : (
            outline.headings.map((h, i) => {
              // Jumping from h2 to h4 leaves a gap that confuses outline navigation.
              const skipped = previous > 0 && h.level > previous + 1
              previous = h.level
              return (
                <button key={i} type="button" className={cx('outline-row', h.hidden && 'dim')} style={{ paddingLeft: 10 + (h.level - 1) * 14 }} onClick={() => show(h.selector)}>
                  <span className={cx('h-tag', skipped && 'red')}>H{h.level}</span>
                  <span className="grow">{h.text || <em>empty heading</em>}</span>
                  {skipped ? <span className="chip tiny red">skips a level</span> : null}
                </button>
              )
            })
          )
        ) : view === 'landmarks' ? (
          outline.landmarks.length === 0 ? (
            <Empty title="No landmarks">Add header, nav, main and footer elements so assistive tech can jump between regions.</Empty>
          ) : (
            <>
              {!outline.landmarks.some((l) => l.role === 'main') ? (
                <div className="issue static">
                  <Sev level="warn" />
                  <span className="issue-body">
                    <span className="issue-title">No main landmark</span>
                    <span className="issue-hint">Wrap the primary content in a main element.</span>
                  </span>
                </div>
              ) : null}
              {outline.landmarks.map((l, i) => (
                <button key={i} type="button" className="outline-row" onClick={() => show(l.selector)}>
                  <span className="h-tag">{l.role}</span>
                  <span className="grow">{l.label || <span className="dim">unlabelled</span>}</span>
                </button>
              ))}
              <p className="dim pad">{outline.focusable} focusable elements. Turn on the Tab order overlay to see their sequence.</p>
            </>
          )
        ) : view === 'links' ? (
          <>
            <div className="summary">
              <span className={cx('stat', emptyLinks.length > 0 && 'red')}>
                <b>{emptyLinks.length}</b> without text
              </span>
              <span className={cx('stat', unsafe.length > 0 && 'amber')}>
                <b>{unsafe.length}</b> unsafe _blank
              </span>
              {checks ? (
                <span className={cx('stat', broken.length > 0 && 'red')}>
                  <b>{broken.length}</b> broken
                </span>
              ) : null}
              <button type="button" className="btn ghost right" onClick={() => void checkLinks()} disabled={checking}>
                <LinkIcon size={12} /> {checking ? 'Checking…' : 'Check for broken links'}
              </button>
            </div>
            {outline.links.map((l, i) => {
              const status = checks?.[l.href.split('#')[0]]
              return (
                <button key={i} type="button" className="outline-row link-row" onClick={() => show(l.selector)}>
                  <span className="grow">
                    <b>{l.text || <em className="red">no accessible text</em>}</b>
                    <i>{displayUrl(l.href)}</i>
                  </span>
                  {l.unsafeBlank ? <span className="chip tiny amber">no rel=noopener</span> : null}
                  {status ? <span className={cx('chip tiny', status.ok ? 'green' : 'red')}>{status.status || 'failed'}</span> : null}
                </button>
              )
            })}
          </>
        ) : (
          <>
            <div className="summary">
              <span className={cx('stat', missingAlt.length > 0 && 'red')}>
                <b>{missingAlt.length}</b> missing alt
              </span>
              <span className="stat">
                <b>{outline.images.filter((i) => i.alt === '').length}</b> decorative
              </span>
            </div>
            {outline.images.map((img, i) => (
              <button key={i} type="button" className="outline-row image-row" onClick={() => show(img.selector)}>
                <img src={img.src} alt="" loading="lazy" />
                <span className="grow">
                  <b>{img.alt === null ? <em className="red">missing alt attribute</em> : img.alt || <span className="dim">alt="" (decorative)</span>}</b>
                  <i>
                    {img.width}×{img.height} · {displayUrl(img.src).split('/').pop()?.slice(0, 40)}
                  </i>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export function BreakpointsPanel({ tab }: { tab: Tab }): ReactNode {
  const breakpoints = useRuntime((s) => s.breakpoints)
  const custom = useWorkspace((s) => s.customDevices)
  const { refresh } = usePageData(tab, loadBreakpoints)
  if (!tab.url || !breakpoints) return <Empty icon={<Ruler size={22} />} title="No page loaded">Open a page to read the breakpoints from its stylesheets.</Empty>

  const widths = [...new Set(breakpoints.map((b) => b.px))].sort((a, b) => a - b)
  const panes = tab.panes.map((p) => ({ pane: p, device: deviceById(p.deviceId, custom) })).map(({ pane, device }) => ({ name: device.kind === 'responsive' ? 'Resizable' : device.name, width: paneSize(pane, device).width }))
  const max = Math.max(1600, ...widths, ...panes.map((p) => p.width)) * 1.04
  const pct = (px: number): string => `${(px / max) * 100}%`
  const uncovered = widths.filter((w, i) => {
    // A band is covered when some open pane's width falls inside it.
    const next = widths[i + 1] ?? Infinity
    return !panes.some((p) => p.width >= w && p.width < next)
  })

  return (
    <div className="panel-content">
      <div className="panel-bar">
        <button
          type="button"
          className="btn primary"
          disabled={widths.length === 0}
          onClick={() => useWorkspace.getState().updateTab(tab.id, { panes: [Math.max(320, widths[0] - 1), ...widths].map((width) => ({ id: Math.random().toString(36).slice(2, 10), deviceId: 'responsive', rotated: false, width, height: 900 })) })}
          title="Replace the open devices with one pane per breakpoint band"
        >
          <Plus size={12} /> One pane per breakpoint
        </button>
        <button type="button" className="btn ghost" onClick={refresh} title="Re-read the stylesheets">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="panel-scroll">
        {widths.length === 0 ? (
          <Empty title="No width breakpoints">The stylesheets on this page declare no min-width or max-width media queries.</Empty>
        ) : (
          <>
            <div className="bp-ruler" aria-hidden="true">
              {widths.map((w) => (
                <span key={w} className="bp-tick" style={{ left: pct(w) }}>
                  <i>{w}</i>
                </span>
              ))}
              {panes.map((p, i) => (
                <span key={i} className="bp-pane" style={{ left: pct(p.width) }} title={`${p.name} · ${p.width}px`} />
              ))}
            </div>
            <p className="dim pad">Lines are breakpoints in the CSS; dots are your open devices.</p>
            {uncovered.length > 0 ? (
              <div className="issue static">
                <Sev level="warn" />
                <span className="issue-body">
                  <span className="issue-title">
                    {uncovered.length} breakpoint range{uncovered.length > 1 ? 's are' : ' is'} not covered by any open device
                  </span>
                  <span className="issue-hint">From {uncovered.map((w) => `${w}px`).join(', ')}. Layout bugs hide in ranges nobody looks at.</span>
                </span>
              </div>
            ) : null}
            {breakpoints.map((b, i) => (
              <div key={i} className="outline-row static">
                <code className="grow">{b.text}</code>
                <span className="dim">×{b.count}</span>
                <button type="button" className="chip" title={`Add a ${b.px}px pane`} onClick={() => void addResponsivePane(tab.id, b.px, 900)}>
                  {b.px}
                </button>
                <button type="button" className="chip" title="Add a pane one pixel on the other side" onClick={() => void addResponsivePane(tab.id, b.feature === 'min-width' ? b.px - 1 : b.px + 1, 900)}>
                  {b.feature === 'min-width' ? b.px - 1 : b.px + 1}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
