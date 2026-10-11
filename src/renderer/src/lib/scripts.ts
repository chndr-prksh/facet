/*
 * Functions in this file are serialised with toString() and evaluated inside
 * device panes. Each one must be fully self-contained: no imports, no
 * references to anything outside its own body.
 */
import type { Issue } from '@shared/types'

export interface AuditOptions {
  touch: boolean
  ios: boolean
  mobile: boolean
  dpr: number
}

export function auditPage(opts: AuditOptions): Issue[] {
  const issues: Issue[] = []
  const root = document.documentElement
  const vw = root.clientWidth
  const vh = window.innerHeight

  const path = (el: Element): string => {
    const parts: string[] = []
    let node: Element | null = el
    while (node && node !== root) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id))
        return parts.join(' > ')
      }
      const parent: Element | null = node.parentElement
      if (!parent) break
      const tag = node.localName
      const twins = Array.from(parent.children).filter((c) => c.localName === tag)
      parts.unshift(twins.length > 1 ? tag + ':nth-of-type(' + (twins.indexOf(node) + 1) + ')' : tag)
      node = parent
    }
    return parts.length ? 'html > ' + parts.join(' > ') : 'html'
  }
  const name = (el: Element): string => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return '<' + el.localName + (el.id ? '#' + el.id : cls) + '>' + (text ? ' “' + text + '”' : '')
  }
  const shown = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0
  }
  const add = (rule: string, severity: Issue['severity'], title: string, detail: string, el?: Element | null, hint?: string): void => {
    issues.push({ rule, severity, title, detail, selector: el ? path(el) : undefined, hint })
  }
  /** Reports up to `cap` elements, then one line for the remainder. */
  const addMany = (rule: string, severity: Issue['severity'], els: Array<[Element, string]>, hint: string, cap = 8): void => {
    els.slice(0, cap).forEach(([el, title]) => add(rule, severity, title, name(el), el, hint))
    if (els.length > cap) add(rule, severity, '…and ' + (els.length - cap) + ' more like this', '', null, hint)
  }

  /* viewport meta */
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewport) {
    add('viewport-missing', opts.mobile ? 'error' : 'warn', 'No viewport meta tag', 'Phones lay this page out at about 980px wide and shrink it to fit.', null, 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.')
  } else {
    const content = viewport.content
    if (/user-scalable\s*=\s*(no|0)/i.test(content) || /maximum-scale\s*=\s*(1(\.0+)?|0?\.\d+)\s*(,|$)/i.test(content)) {
      add('viewport-zoom', 'warn', 'Pinch-to-zoom is disabled', content, viewport, 'Remove user-scalable=no and maximum-scale=1 so low-vision users can zoom (WCAG 1.4.4).')
    }
    if (!/width\s*=\s*device-width/i.test(content)) add('viewport-width', 'warn', 'Viewport is not set to device-width', content, viewport, 'Use width=device-width.')
  }

  /* horizontal overflow */
  const overflow = root.scrollWidth - vw
  if (overflow > 1 && document.body) {
    const clips = (el: Element): boolean => /hidden|clip/.test(getComputedStyle(el).overflowX)
    const clipped = clips(root) || clips(document.body)
    add(
      'overflow-x',
      clipped ? 'warn' : 'error',
      clipped ? overflow + 'px of content is cut off on the right' : 'Page scrolls sideways by ' + overflow + 'px',
      'The document is ' + root.scrollWidth + 'px wide in a ' + vw + 'px viewport.',
      null,
      'Usual causes: a fixed width, a long unbroken string, 100vw next to a scrollbar, or a negative margin.'
    )
    const all = Array.from(document.body.querySelectorAll('*')).slice(0, 8000)
    const wide = new Set<Element>()
    const spilling: Element[] = []
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      const sticksOut = r.right > vw + 1
      // Its own box fits, but unbreakable content (a long word, a <pre>) pokes out of it.
      const spills = !sticksOut && style.overflowX === 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && r.left + el.scrollWidth > vw + 1
      if (!sticksOut && !spills) continue
      let contained = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          contained = true
          break
        }
      }
      if (contained) continue
      if (sticksOut) wide.add(el)
      else spilling.push(el)
    }
    // The culprit is the outermost element that sticks out of a parent that
    // fits: a table, not each of its cells. Everything inside it is a symptom.
    const culprits: Array<[Element, string]> = [...wide]
      .filter((el) => !el.parentElement || !wide.has(el.parentElement))
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .map((el) => [el, 'Extends ' + Math.round(el.getBoundingClientRect().right - vw) + 'px past the viewport'])
    for (const el of spilling) {
      if (Array.from(el.querySelectorAll('*')).some((child) => wide.has(child))) continue
      culprits.push([el, 'Its content overflows by ' + Math.round(el.getBoundingClientRect().left + el.scrollWidth - vw) + 'px'])
    }
    addMany('overflow-element', 'error', culprits, 'Constrain it with max-width: 100%, min-width: 0 on a flex child, overflow-wrap: anywhere, or let it scroll inside its own container.', 6)
  }

  /* text: size and clipping */
  const small = new Map<Element, number>()
  const clippedText: Array<[Element, string]> = []
  const walker = document.createTreeWalker(document.body || root, NodeFilter.SHOW_TEXT)
  const seen = new Set<Element>()
  for (let node = walker.nextNode(), n = 0; node && n < 6000; node = walker.nextNode(), n++) {
    const el = node.parentElement
    if (!el || seen.has(el) || !(node.nodeValue || '').trim()) continue
    seen.add(el)
    if (/^(script|style|noscript|template|option)$/.test(el.localName) || !shown(el)) continue
    const style = getComputedStyle(el)
    const size = parseFloat(style.fontSize)
    if (size > 0 && size < 12) small.set(el, size)
    if (/hidden|clip/.test(style.overflowX) && style.textOverflow !== 'ellipsis' && style.whiteSpace.indexOf('nowrap') >= 0 && el.scrollWidth > el.clientWidth + 2) {
      clippedText.push([el, 'Text is cut off without an ellipsis'])
    }
  }
  addMany('text-small', 'warn', [...small].sort((a, b) => a[1] - b[1]).map(([el, size]) => [el, 'Text is only ' + Math.round(size * 10) / 10 + 'px']), 'Body text under 12px is hard to read on phones; aim for 16px.', 6)
  addMany('text-clipped', 'warn', clippedText, 'Add text-overflow: ellipsis, allow wrapping, or give the element more room.', 5)

  /* tap targets */
  if (opts.touch) {
    const tiny: Array<[Element, string]> = []
    let cramped = 0
    const controls = document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[onclick]')
    for (const el of Array.from(controls)) {
      if (!shown(el)) continue
      const r = el.getBoundingClientRect()
      // Links inside a sentence are exempt from the target-size rule (WCAG 2.5.8).
      if (el.localName === 'a' && getComputedStyle(el).display === 'inline') {
        const around = (el.parentElement?.textContent || '').trim().length
        if (around > (el.textContent || '').trim().length + 12) continue
      }
      if (r.width < 24 || r.height < 24) tiny.push([el, 'Tap target is ' + Math.round(r.width) + ' × ' + Math.round(r.height) + 'px'])
      else if (r.width < 44 || r.height < 44) cramped++
    }
    addMany('tap-target', 'error', tiny, 'Targets must be at least 24 × 24px (WCAG 2.5.8); 44 × 44px is comfortable.', 8)
    if (cramped) add('tap-target-comfort', 'info', cramped + ' tap target' + (cramped > 1 ? 's are' : ' is') + ' under 44 × 44px', 'They pass the 24px minimum but are easy to miss with a thumb.', null, 'Turn on the Tap targets overlay to see them.')
  }

  /* iOS zooms the page when a focused field has a font size under 16px */
  if (opts.ios) {
    const zooming: Array<[Element, string]> = []
    for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),select,textarea'))) {
      if (!shown(el)) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 16) zooming.push([el, 'Field text is ' + Math.round(size * 10) / 10 + 'px, so iOS zooms in on focus'])
    }
    addMany('ios-input-zoom', 'warn', zooming, 'Give form controls font-size: 16px or larger.', 5)
  }

  /* images */
  const heavy: Array<[Element, string]> = []
  const blurry: Array<[Element, string]> = []
  let unsized = 0
  for (const img of Array.from(document.images)) {
    if (!shown(img) || !img.naturalWidth || /\.svg(\?|$)/i.test(img.currentSrc)) continue
    const r = img.getBoundingClientRect()
    const needed = r.width * opts.dpr
    if (img.naturalWidth > needed * 2 && img.naturalWidth > 800) heavy.push([img, img.naturalWidth + 'px image shown at ' + Math.round(r.width) + 'px'])
    else if (img.naturalWidth < r.width * Math.min(opts.dpr, 2) * 0.6 && r.width > 96) blurry.push([img, img.naturalWidth + 'px image stretched to ' + Math.round(r.width) + 'px'])
    if (!img.hasAttribute('width') && !img.hasAttribute('height') && getComputedStyle(img).aspectRatio === 'auto') unsized++
  }
  addMany('image-oversized', 'info', heavy, 'Serve a smaller file for this viewport with srcset and sizes.', 4)
  addMany('image-blurry', 'info', blurry, 'Provide a higher-resolution source for high-density screens.', 4)
  if (unsized > 0) add('image-unsized', 'info', unsized + ' image' + (unsized > 1 ? 's have' : ' has') + ' no width/height', 'The layout shifts when they load.', null, 'Set width and height attributes or a CSS aspect-ratio.')

  /* fixed chrome eating a small screen */
  if (opts.mobile && document.body) {
    let area = 0
    let worst: Element | null = null
    let worstArea = 0
    for (const el of Array.from(document.body.querySelectorAll('*')).slice(0, 8000)) {
      if (getComputedStyle(el).position !== 'fixed' || !shown(el)) continue
      const r = el.getBoundingClientRect()
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
      const own = w * h
      if (own >= vw * vh * 0.98) continue
      area += own
      if (own > worstArea) {
        worstArea = own
        worst = el
      }
    }
    const share = Math.round((area / (vw * vh)) * 100)
    if (share >= 30) add('fixed-coverage', 'warn', 'Fixed elements cover ' + Math.min(share, 100) + '% of the screen', worst ? name(worst) : '', worst, 'Shrink or collapse sticky headers, banners and cookie bars on small screens.')
  }

  return issues
}

/* ---------- metadata ---------- */

export interface PageMeta {
  url: string
  title: string
  description: string
  canonical: string
  robots: string
  lang: string
  charset: string
  viewport: string
  themeColor: string
  favicon: string
  icons: Array<{ rel: string; href: string; sizes: string }>
  manifest: string
  og: Record<string, string>
  twitter: Record<string, string>
  hreflang: Array<{ lang: string; href: string }>
  jsonLd: Array<{ type: string; valid: boolean }>
  h1: string[]
  wordCount: number
}

export function extractMeta(): PageMeta {
  const abs = (href: string | null | undefined): string => {
    if (!href) return ''
    try {
      return new URL(href, document.baseURI).href
    } catch {
      return ''
    }
  }
  const meta = (key: string): string =>
    document.querySelector<HTMLMetaElement>('meta[name="' + key + '" i]')?.content?.trim() ?? document.querySelector<HTMLMetaElement>('meta[property="' + key + '" i]')?.content?.trim() ?? ''
  const group = (prefix: string): Record<string, string> => {
    const out: Record<string, string> = {}
    document.querySelectorAll<HTMLMetaElement>('meta[property^="' + prefix + '"],meta[name^="' + prefix + '"]').forEach((m) => {
      const key = (m.getAttribute('property') || m.getAttribute('name') || '').slice(prefix.length)
      if (key && !(key in out)) out[key] = m.content.trim()
    })
    return out
  }
  const og = group('og:')
  const twitter = group('twitter:')
  if (og.image) og.image = abs(og.image)
  if (twitter.image) twitter.image = abs(twitter.image)

  const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="mask-icon"]')).map((l) => ({
    rel: l.rel,
    href: abs(l.getAttribute('href')),
    sizes: l.getAttribute('sizes') ?? ''
  }))
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
    try {
      const data = JSON.parse(s.textContent || '')
      const items = Array.isArray(data) ? data : data['@graph'] || [data]
      return { type: items.map((i: Record<string, unknown>) => String(i['@type'] ?? '?')).join(', '), valid: true }
    } catch {
      return { type: 'Invalid JSON', valid: false }
    }
  })

  return {
    url: location.href,
    title: document.title.trim(),
    description: meta('description'),
    canonical: abs(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href')),
    robots: meta('robots'),
    lang: document.documentElement.lang,
    charset: document.characterSet,
    viewport: meta('viewport'),
    themeColor: meta('theme-color'),
    favicon: icons.find((i) => /icon/.test(i.rel) && !/apple|mask/.test(i.rel))?.href || abs('/favicon.ico'),
    icons,
    manifest: abs(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')),
    og,
    twitter,
    hreflang: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')).map((l) => ({ lang: l.hreflang, href: abs(l.getAttribute('href')) })),
    jsonLd,
    h1: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').trim().replace(/\s+/g, ' ')),
    wordCount: ((document.body?.innerText || '').match(/\S+/g) || []).length
  }
}

/* ---------- document outline ---------- */

export interface OutlineData {
  headings: Array<{ level: number; text: string; selector: string; hidden: boolean }>
  landmarks: Array<{ role: string; label: string; selector: string }>
  links: Array<{ href: string; text: string; selector: string; external: boolean; unsafeBlank: boolean }>
  images: Array<{ src: string; alt: string | null; selector: string; width: number; height: number }>
  focusable: number
}

export function extractOutline(): OutlineData {
  const root = document.documentElement
  const path = (el: Element): string => {
    const parts: string[] = []
    let node: Element | null = el
    while (node && node !== root) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id))
        return parts.join(' > ')
      }
      const parent: Element | null = node.parentElement
      if (!parent) break
      const tag = node.localName
      const twins = Array.from(parent.children).filter((c) => c.localName === tag)
      parts.unshift(twins.length > 1 ? tag + ':nth-of-type(' + (twins.indexOf(node) + 1) + ')' : tag)
      node = parent
    }
    return parts.length ? 'html > ' + parts.join(' > ') : 'html'
  }
  const text = (el: Element): string => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const hidden = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    return r.width === 0 && r.height === 0
  }

  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).map((h) => ({
    level: Number(h.getAttribute('aria-level')) || Number(h.localName[1]) || 2,
    text: text(h),
    selector: path(h),
    hidden: hidden(h)
  }))

  const implicit: Record<string, string> = { header: 'banner', nav: 'navigation', main: 'main', aside: 'complementary', footer: 'contentinfo', form: 'form', section: 'region', search: 'search' }
  const landmarks = Array.from(document.querySelectorAll('header,nav,main,aside,footer,search,form[aria-label],form[aria-labelledby],section[aria-label],section[aria-labelledby],[role="banner"],[role="navigation"],[role="main"],[role="complementary"],[role="contentinfo"],[role="search"],[role="region"]'))
    // header/footer are only landmarks when they belong to the page, not to an article or section.
    .filter((el) => !/^(header|footer)$/.test(el.localName) || !el.closest('article,section,aside,main,nav'))
    .map((el) => ({
      role: el.getAttribute('role') || implicit[el.localName] || el.localName,
      label: el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent || '').trim() : ''),
      selector: path(el)
    }))

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .slice(0, 600)
    .map((a) => ({
      href: a.href,
      text: text(a) || (a.querySelector('img[alt]')?.getAttribute('alt') ?? ''),
      selector: path(a),
      external: a.host !== location.host && /^https?:$/.test(a.protocol),
      unsafeBlank: a.target === '_blank' && !/noopener|noreferrer/.test(a.rel)
    }))

  const images = Array.from(document.images)
    .slice(0, 300)
    .map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.hasAttribute('alt') ? img.alt : null,
      selector: path(img),
      width: img.naturalWidth,
      height: img.naturalHeight
    }))

  const focusable = document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').length
  return { headings, landmarks, links, images, focusable }
}

/* ---------- one element, measured in one pane ---------- */

export interface ElementReport {
  found: boolean
  visible: boolean
  tag: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  styles: Record<string, string>
}

export function measureElement(selector: string): ElementReport {
  let el: Element | null = null
  try {
    el = document.querySelector(selector)
  } catch {
    el = null
  }
  if (!el) return { found: false, visible: false, tag: '', text: '', rect: { x: 0, y: 0, width: 0, height: 0 }, styles: {} }
  const r = el.getBoundingClientRect()
  const s = getComputedStyle(el)
  const pick = ['display', 'position', 'fontSize', 'lineHeight', 'fontWeight', 'color', 'backgroundColor', 'padding', 'margin', 'flexDirection', 'gridTemplateColumns', 'gap', 'textAlign', 'overflow', 'zIndex']
  const styles: Record<string, string> = {}
  for (const key of pick) styles[key] = String(s[key as keyof CSSStyleDeclaration] ?? '')
  return {
    found: true,
    visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
    tag: el.localName + (el.id ? '#' + el.id : ''),
    text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 },
    styles
  }
}

/* ---------- page text and controls, for agents ---------- */

export interface PageRead {
  url: string
  title: string
  text: string
  elements: Array<{ selector: string; kind: string; label: string; href?: string }>
}

export function readPage(): PageRead {
  const root = document.documentElement
  const path = (el: Element): string => {
    const parts: string[] = []
    let node: Element | null = el
    while (node && node !== root) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id))
        return parts.join(' > ')
      }
      const parent: Element | null = node.parentElement
      if (!parent) break
      const tag = node.localName
      const twins = Array.from(parent.children).filter((c) => c.localName === tag)
      parts.unshift(twins.length > 1 ? tag + ':nth-of-type(' + (twins.indexOf(node) + 1) + ')' : tag)
      node = parent
    }
    return parts.length ? 'html > ' + parts.join(' > ') : 'html'
  }
  const elements: PageRead['elements'] = []
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="tab"],[role="menuitem"]'))) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const input = el as HTMLInputElement
    const label = (el.getAttribute('aria-label') || el.innerText || input.placeholder || input.name || input.value || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    elements.push({
      selector: path(el),
      kind: el.localName === 'input' ? 'input[' + input.type + ']' : el.localName,
      label,
      href: el.localName === 'a' ? (el as HTMLAnchorElement).href : undefined
    })
    if (elements.length >= 150) break
  }
  return { url: location.href, title: document.title, text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 8000), elements }
}

/* ---------- accessibility (axe-core) ---------- */

export interface A11yViolation {
  id: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  help: string
  description: string
  helpUrl: string
  wcag: string[]
  nodes: Array<{ selector: string; html: string; fix: string }>
}

export interface A11yResult {
  violations: A11yViolation[]
  passes: number
  incomplete: number
  ranAt: number
  error?: string
}

/** Runs after the axe-core source has been evaluated in the page. */
export function runAxe(): Promise<Omit<A11yResult, 'ranAt'>> {
  type AxeNode = { target: unknown[]; html: string; failureSummary?: string }
  type AxeRule = { id: string; impact?: string; help: string; description: string; helpUrl: string; tags: string[]; nodes: AxeNode[] }
  const axe = (window as unknown as { axe: { run(ctx: Document, opts: object): Promise<{ violations: AxeRule[]; passes: AxeRule[]; incomplete: AxeRule[] }> } }).axe
  return axe.run(document, { resultTypes: ['violations', 'incomplete', 'passes'] }).then((res) => ({
    passes: res.passes.length,
    incomplete: res.incomplete.length,
    violations: res.violations.map((v) => ({
      id: v.id,
      impact: (v.impact || 'minor') as A11yViolation['impact'],
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      wcag: v.tags.filter((t) => /^wcag\d|^best-practice$/.test(t)),
      nodes: v.nodes.slice(0, 25).map((n) => ({
        selector: String(n.target[n.target.length - 1] ?? ''),
        html: n.html.slice(0, 220),
        fix: (n.failureSummary || '').replace(/^Fix (any|all) of the following:\s*/i, '').trim()
      }))
    }))
  }))
}
