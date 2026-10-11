/*
 * Runs inside every device pane, in an isolated world. It mirrors user
 * interactions to the host, replays the ones made in sibling panes, reports
 * page metrics and web vitals, and draws the cross-device element picker.
 *
 * Self-contained on purpose: sandboxed preloads cannot require local files.
 */
import { ipcRenderer } from 'electron'

interface SyncEvent {
  type: 'scroll' | 'click' | 'input' | 'submit' | 'key'
  selector?: string
  xr?: number
  yr?: number
  value?: string
  checked?: boolean
  key?: string
}

const toHost = (channel: string, payload?: unknown): void => ipcRenderer.sendToHost(channel, payload)
const now = (): number => performance.now()

/* ---------- selectors ---------- */

const isUniqueId = (id: string): boolean => {
  try {
    return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1
  } catch {
    return false
  }
}

/** A selector that resolves to the same element in a sibling pane showing the same page. */
function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    if (node.id && isUniqueId(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      return parts.join(' > ')
    }
    const parent: Element | null = node.parentElement
    if (!parent) break
    const tag = node.localName
    const twins = Array.from(parent.children).filter((c) => c.localName === tag)
    parts.unshift(twins.length > 1 ? `${tag}:nth-of-type(${twins.indexOf(node) + 1})` : tag)
    node = parent
  }
  return parts.length ? `html > ${parts.join(' > ')}` : 'html'
}

const find = (selector?: string): HTMLElement | null => {
  if (!selector) return null
  try {
    return document.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}

/* ---------- interaction mirroring ---------- */

let lastInput = 0
let pointerInside = false
let suppressScrollUntil = 0
let applying = 0
let lastClickSent = 0
let lastActiveSent = 0
let inspecting = false

const userDriven = (): boolean => pointerInside || now() - lastInput < 1500

function markActive(): void {
  lastInput = now()
  if (lastInput - lastActiveSent > 400) {
    lastActiveSent = lastInput
    toHost('facet:active')
  }
}

for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const) {
  window.addEventListener(type, markActive, { capture: true, passive: true })
}
window.addEventListener('mousemove', () => (pointerInside = true), { capture: true, passive: true })
document.addEventListener('mouseleave', () => (pointerInside = false))
window.addEventListener('blur', () => (pointerInside = false))

/**
 * How far an element can scroll. The document is measured against the layout
 * viewport, which on phones grows past the screen when the page overflows.
 */
function scrollRange(el: Element): [x: number, y: number] {
  const isDocument = el === document.scrollingElement
  return [el.scrollWidth - (isDocument ? window.innerWidth : el.clientWidth), el.scrollHeight - (isDocument ? window.innerHeight : el.clientHeight)]
}

const pendingScroll = new Set<Element | Document>()
let scrollFrame = 0

function flushScroll(): void {
  scrollFrame = 0
  for (const target of pendingScroll) {
    const el = target === document ? document.scrollingElement : (target as Element)
    if (!el) continue
    const [maxX, maxY] = scrollRange(el)
    toHost('facet:sync', {
      type: 'scroll',
      selector: target === document ? undefined : cssPath(el),
      yr: maxY > 0 ? el.scrollTop / maxY : 0,
      xr: maxX > 0 ? el.scrollLeft / maxX : 0
    } satisfies SyncEvent)
  }
  pendingScroll.clear()
}

document.addEventListener(
  'scroll',
  (e) => {
    // Scroll events carry no "who did this" flag, so replays are told apart by timing.
    if (now() < suppressScrollUntil || !userDriven()) return
    pendingScroll.add(e.target === document ? document : (e.target as Element))
    if (!scrollFrame) scrollFrame = requestAnimationFrame(flushScroll)
  },
  { capture: true, passive: true }
)

const INTERACTIVE = 'a[href],button,summary,label,select,[role="button"],[role="tab"],[role="menuitem"],[role="link"],[role="switch"],[role="checkbox"],[onclick]'

document.addEventListener(
  'click',
  (e) => {
    if (!e.isTrusted || applying || inspecting) return
    const target = e.composedPath()[0]
    if (!(target instanceof Element)) return
    // The nearest control survives responsive markup changes better than the exact node hit.
    const el = target.closest(INTERACTIVE) ?? target
    lastClickSent = now()
    toHost('facet:sync', { type: 'click', selector: cssPath(el) } satisfies SyncEvent)
  },
  true
)

document.addEventListener(
  'input',
  (e) => {
    if (!e.isTrusted || applying) return
    const el = e.target
    if (el instanceof HTMLInputElement) {
      if (el.type === 'file') return
      const toggles = el.type === 'checkbox' || el.type === 'radio'
      toHost('facet:sync', { type: 'input', selector: cssPath(el), value: el.value, checked: toggles ? el.checked : undefined } satisfies SyncEvent)
    } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      toHost('facet:sync', { type: 'input', selector: cssPath(el), value: el.value } satisfies SyncEvent)
    }
  },
  true
)

document.addEventListener(
  'submit',
  (e) => {
    // A submit caused by clicking its button was already mirrored as that click.
    if (!e.isTrusted || applying || now() - lastClickSent < 120) return
    if (e.target instanceof HTMLFormElement) toHost('facet:sync', { type: 'submit', selector: cssPath(e.target) } satisfies SyncEvent)
  },
  true
)

document.addEventListener(
  'keydown',
  (e) => {
    if (!e.isTrusted || applying) return
    if (inspecting && e.key === 'Escape') return toHost('facet:inspect-cancel')
    if (e.key === 'Escape') toHost('facet:sync', { type: 'key', key: e.key } satisfies SyncEvent)
  },
  true
)

const nativeSetter = (proto: object, prop: string): ((this: unknown, v: unknown) => void) | undefined =>
  Object.getOwnPropertyDescriptor(proto, prop)?.set

function replay(evt: SyncEvent): void {
  applying++
  try {
    if (evt.type === 'scroll') {
      const el = evt.selector ? find(evt.selector) : (document.scrollingElement as HTMLElement | null)
      if (!el) return
      suppressScrollUntil = now() + 200
      const [maxX, maxY] = scrollRange(el)
      el.scrollTo({ top: (evt.yr ?? 0) * maxY, left: (evt.xr ?? 0) * maxX, behavior: 'instant' })
      return
    }

    if (evt.type === 'key') {
      const target = document.activeElement ?? document.body
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(new KeyboardEvent(type, { key: evt.key, code: evt.key, bubbles: true, cancelable: true, composed: true }))
      }
      return
    }

    const el = find(evt.selector)
    if (!el) return

    if (evt.type === 'click') {
      const rect = el.getBoundingClientRect()
      // Not rendered at this viewport (a hamburger button on desktop, say).
      if (rect.width === 0 && rect.height === 0) return
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }
      el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }))
      el.dispatchEvent(new MouseEvent('mousedown', init))
      el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }))
      el.dispatchEvent(new MouseEvent('mouseup', init))
      el.click()
      return
    }

    if (evt.type === 'input') {
      if (el instanceof HTMLInputElement && evt.checked !== undefined) {
        if (el.checked === evt.checked) return
        nativeSetter(HTMLInputElement.prototype, 'checked')?.call(el, evt.checked)
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.value === evt.value) return
        // Go through the prototype setter so framework-controlled inputs notice the change.
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
        nativeSetter(proto, 'value')?.call(el, evt.value ?? '')
      } else return
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }

    if (evt.type === 'submit' && el instanceof HTMLFormElement) el.requestSubmit()
  } catch {
    /* a page-specific failure must never break mirroring */
  } finally {
    applying--
  }
}

ipcRenderer.on('facet:sync', (_e, evt: SyncEvent) => replay(evt))

/* Pinch gestures arrive as ctrl+wheel; hand them to the host to zoom the stage instead of the page. */
window.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    toHost('facet:pinch', e.deltaY)
  },
  { passive: false, capture: true }
)

/* ---------- page metrics ---------- */

let metricsTimer = 0
let lastMetrics = ''

function reportMetrics(): void {
  const root = document.documentElement
  if (!root) return
  const clipped = (el: Element | null): boolean => !!el && /hidden|clip/.test(getComputedStyle(el).overflowX)
  const metrics = {
    scrollWidth: root.scrollWidth,
    scrollHeight: root.scrollHeight,
    viewportWidth: root.clientWidth,
    overflowX: root.scrollWidth > root.clientWidth + 1 && !clipped(root) && !clipped(document.body)
  }
  const json = JSON.stringify(metrics)
  if (json === lastMetrics) return
  lastMetrics = json
  toHost('facet:metrics', metrics)
}

const scheduleMetrics = (): void => {
  clearTimeout(metricsTimer)
  metricsTimer = window.setTimeout(reportMetrics, 350)
}

/* ---------- web vitals ---------- */

const vitals: Record<string, number> = {}
let vitalsTimer = 0

const scheduleVitals = (): void => {
  clearTimeout(vitalsTimer)
  vitalsTimer = window.setTimeout(() => toHost('facet:vitals', vitals), 400)
}

function observe(type: string, onEntries: (entries: PerformanceEntry[]) => void, extra?: object): void {
  try {
    new PerformanceObserver((list) => {
      onEntries(list.getEntries())
      scheduleVitals()
    }).observe({ type, buffered: true, ...extra })
  } catch {
    /* entry type unsupported */
  }
}

function startVitals(): void {
  observe('paint', (entries) => {
    for (const e of entries) if (e.name === 'first-contentful-paint') vitals.fcp = e.startTime
  })
  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1]
    if (last) vitals.lcp = last.startTime
  })

  // CLS is the worst "session window": shifts under 1s apart, capped at 5s.
  let windowValue = 0
  let windowStart = 0
  let windowLast = 0
  observe('layout-shift', (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
      if (entry.hadRecentInput) continue
      if (windowValue && entry.startTime - windowLast < 1000 && entry.startTime - windowStart < 5000) windowValue += entry.value
      else {
        windowValue = entry.value
        windowStart = entry.startTime
      }
      windowLast = entry.startTime
      vitals.cls = Math.max(vitals.cls ?? 0, windowValue)
    }
  })

  observe(
    'event',
    (entries) => {
      for (const entry of entries as Array<PerformanceEntry & { interactionId?: number }>) {
        if (entry.interactionId) vitals.inp = Math.max(vitals.inp ?? 0, entry.duration)
      }
    },
    { durationThreshold: 40 }
  )

  const nav = (): void => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (!entry) return
    vitals.ttfb = entry.responseStart
    if (entry.domContentLoadedEventEnd) vitals.domContentLoaded = entry.domContentLoadedEventEnd
    if (entry.loadEventEnd) vitals.load = entry.loadEventEnd
    scheduleVitals()
  }
  window.addEventListener('load', () => setTimeout(nav, 0))
  nav()
}

/* ---------- element picker & highlighter ---------- */

let box: HTMLElement | null = null
let boxLabel: HTMLElement | null = null
let boxTimer = 0
let hoverSelector = ''

function ensureBox(): HTMLElement {
  if (box?.isConnected) return box
  box = document.createElement('facet-highlight')
  box.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid #c6f35e;background:rgba(198,243,94,.16);border-radius:2px;display:none;transition:all .06s linear'
  boxLabel = document.createElement('facet-label')
  boxLabel.style.cssText =
    'position:absolute;left:-2px;bottom:100%;margin-bottom:3px;padding:2px 6px;border-radius:4px;background:#14161a;color:#e8eaed;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap'
  box.appendChild(boxLabel)
  document.documentElement.appendChild(box)
  return box
}

function drawBox(el: Element | null, color = '#c6f35e'): void {
  const node = ensureBox()
  if (!el) {
    node.style.display = 'none'
    return
  }
  const r = el.getBoundingClientRect()
  node.style.display = 'block'
  node.style.borderColor = color
  node.style.left = `${r.left}px`
  node.style.top = `${r.top}px`
  node.style.width = `${r.width}px`
  node.style.height = `${r.height}px`
  if (boxLabel) {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
    boxLabel.textContent = `${el.localName}${el.id ? `#${el.id}` : cls}  ${Math.round(r.width)} × ${Math.round(r.height)}`
    boxLabel.style.bottom = r.top < 24 ? 'auto' : '100%'
    boxLabel.style.top = r.top < 24 ? '100%' : 'auto'
  }
}

const swallow = (e: Event): void => {
  if (!inspecting) return
  e.preventDefault()
  e.stopImmediatePropagation()
}

for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu']) {
  window.addEventListener(type, swallow, { capture: true, passive: false })
}

window.addEventListener(
  'mousemove',
  (e) => {
    if (!inspecting) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || el === box) return
    const selector = cssPath(el)
    if (selector === hoverSelector) return
    hoverSelector = selector
    drawBox(el)
    toHost('facet:inspect-hover', selector)
  },
  { capture: true, passive: true }
)

window.addEventListener(
  'click',
  (e) => {
    if (!inspecting) return
    swallow(e)
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el) toHost('facet:inspect-pick', { selector: cssPath(el), x: e.clientX, y: e.clientY })
  },
  { capture: true }
)

ipcRenderer.on('facet:inspect', (_e, on: boolean) => {
  inspecting = on
  hoverSelector = ''
  document.documentElement.style.cursor = on ? 'crosshair' : ''
  if (!on) drawBox(null)
})

ipcRenderer.on('facet:pick-at', (_e, point: { x: number; y: number }) => {
  const el = document.elementFromPoint(point.x, point.y)
  if (el) toHost('facet:inspect-pick', { selector: cssPath(el) })
})

ipcRenderer.on('facet:highlight', (_e, opts: { selector?: string; scroll?: boolean; color?: string; hold?: boolean }) => {
  clearTimeout(boxTimer)
  const el = find(opts.selector)
  if (!el) return drawBox(null)
  if (opts.scroll) {
    suppressScrollUntil = now() + 600
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  }
  drawBox(el, opts.color)
  if (!opts.hold) boxTimer = window.setTimeout(() => !inspecting && drawBox(null), 2600)
})

/* ---------- boot ---------- */

function boot(): void {
  reportMetrics()
  new MutationObserver(scheduleMetrics).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
  window.addEventListener('resize', scheduleMetrics)
  window.addEventListener('load', scheduleMetrics)
}

if (window.top === window && /^(https?|file):$/.test(location.protocol)) {
  startVitals()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
}
