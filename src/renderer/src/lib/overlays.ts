export interface OverlayDef {
  id: string
  name: string
  group: 'Layout' | 'Touch' | 'Accessibility' | 'Content'
  hint: string
  css?: string
  /** Handled by `overlayRuntime` inside the page. */
  script?: boolean
}

const NOT_OURS = ':not(facet-overlay):not(facet-overlay *):not(facet-highlight):not(facet-highlight *)'

export const OVERLAYS: OverlayDef[] = [
  { id: 'outline', name: 'Outline every element', group: 'Layout', hint: 'See the box of every element to spot stray margins and overflow', css: `*${NOT_OURS}{outline:1px solid rgba(255,64,160,.5)!important;outline-offset:-1px!important}` },
  { id: 'containers', name: 'Flex and grid containers', group: 'Layout', hint: 'Label every flex and grid container', script: true },
  { id: 'overflow', name: 'Overflowing elements', group: 'Layout', hint: 'Mark elements that extend past the viewport edge', script: true },
  { id: 'grid', name: 'Column grid', group: 'Layout', hint: '4, 8 or 12 columns depending on viewport width', script: true },
  { id: 'baseline', name: '8px baseline grid', group: 'Layout', hint: 'Check vertical rhythm', script: true },
  { id: 'zindex', name: 'z-index values', group: 'Layout', hint: 'Label every element that sets a z-index', script: true },

  { id: 'thumb', name: 'Thumb reach (right hand)', group: 'Touch', hint: 'Green is easy to reach one-handed, red is a stretch', script: true },
  { id: 'thumb-left', name: 'Thumb reach (left hand)', group: 'Touch', hint: 'The same map mirrored for left-handed use', script: true },
  { id: 'tap', name: 'Tap target sizes', group: 'Touch', hint: 'Red under 24px, amber under 44px, green otherwise', script: true },
  { id: 'safe-area', name: 'Safe-area insets', group: 'Touch', hint: 'Shade the notch and home-indicator areas', script: true },

  { id: 'headings', name: 'Heading levels', group: 'Accessibility', hint: 'Badge every heading with its level', script: true },
  { id: 'landmarks', name: 'Landmarks', group: 'Accessibility', hint: 'Outline header, nav, main and other regions', script: true },
  { id: 'focus-order', name: 'Tab order', group: 'Accessibility', hint: 'Number focusable elements in keyboard order', script: true },
  { id: 'alt', name: 'Image alt text', group: 'Accessibility', hint: 'Show alt text on images, flag missing ones', script: true },
  { id: 'small-text', name: 'Small text', group: 'Accessibility', hint: 'Mark text smaller than 12px', script: true },
  { id: 'focus-ring', name: 'Force focus rings', group: 'Accessibility', hint: 'Make keyboard focus impossible to miss', css: ':focus{outline:3px solid #ff3df2!important;outline-offset:2px!important}' },
  {
    id: 'text-spacing',
    name: 'Text spacing (WCAG 1.4.12)',
    group: 'Accessibility',
    hint: 'Apply the spacing users may set; nothing should be cut off',
    css: `*${NOT_OURS}{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p${NOT_OURS}{margin-bottom:2em!important}`
  },

  { id: 'edit', name: 'Edit text in place', group: 'Content', hint: 'Type directly on the page to try different copy', script: true },
  { id: 'chaos-long', name: 'Stress: longer text', group: 'Content', hint: 'Lengthen all copy, as a translation would', script: true },
  { id: 'chaos-short', name: 'Stress: shorter text', group: 'Content', hint: 'Shorten all copy to test sparse states', script: true },
  { id: 'rtl', name: 'Right-to-left', group: 'Content', hint: 'Flip the document direction', script: true },
  { id: 'no-images', name: 'Hide images', group: 'Content', hint: 'See the page as it looks before images load', css: 'img,picture,video,canvas,svg image{visibility:hidden!important}*,*::before,*::after{background-image:none!important}' },
  { id: 'no-css', name: 'Disable CSS', group: 'Content', hint: 'Check the document makes sense unstyled', script: true },
  { id: 'no-anim', name: 'Freeze animations', group: 'Content', hint: 'Pause animations and transitions', css: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;scroll-behavior:auto!important}' }
]

/* Serialised into the page; must stay self-contained. */
export function overlayRuntime(id: string, on: boolean): void {
  const w = window as unknown as { __facetOverlays?: Record<string, () => void> }
  const store = (w.__facetOverlays ||= {})
  store[id]?.()
  delete store[id]
  if (!on || !document.body) return

  const root = document.documentElement
  const layer = (fixed: boolean): HTMLElement => {
    const el = document.createElement('facet-overlay')
    el.setAttribute('data-id', id)
    el.style.cssText = 'left:0;top:0;pointer-events:none;z-index:2147483646;' + (fixed ? 'position:fixed;width:100vw;height:100vh' : 'position:absolute;width:100%;height:0')
    root.appendChild(el)
    return el
  }
  const mark = (parent: HTMLElement, el: Element, color: string, label?: string, fill = false): void => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    const node = document.createElement('div')
    node.style.cssText = 'position:absolute;box-sizing:border-box;left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:1.5px solid ' + color + ';border-radius:2px;' + (fill ? 'background:' + color + '2e;' : '')
    if (label) {
      const tag = document.createElement('span')
      tag.textContent = label
      tag.style.cssText = 'position:absolute;left:-1.5px;top:-1.5px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 5px;border-radius:2px 0 4px 0;background:' + color + ';color:#0b0c0e;font:700 10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace'
      node.appendChild(tag)
    }
    parent.appendChild(node)
  }
  /** Draws now and again whenever layout could have changed. */
  const live = (draw: (parent: HTMLElement) => void): void => {
    const parent = layer(false)
    let timer = 0
    const redraw = (): void => {
      parent.textContent = ''
      draw(parent)
    }
    const schedule = (): void => {
      clearTimeout(timer)
      timer = window.setTimeout(redraw, 220)
    }
    redraw()
    addEventListener('resize', schedule)
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] })
    store[id] = () => {
      clearTimeout(timer)
      removeEventListener('resize', schedule)
      observer.disconnect()
      parent.remove()
    }
  }
  const fixedLayer = (css: string, html = ''): void => {
    const el = layer(true)
    el.style.cssText += ';' + css
    el.innerHTML = html
    store[id] = () => el.remove()
  }
  const each = (selector: string, fn: (el: HTMLElement) => void, cap = 1500): void => {
    Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(0, cap).forEach(fn)
  }
  const RED = '#ff5c5c'
  const AMBER = '#f5b83d'
  const GREEN = '#3ddc97'
  const BLUE = '#5ca8ff'
  const PINK = '#ff7ad9'

  switch (id) {
    case 'grid': {
      const vw = root.clientWidth
      const cols = vw < 600 ? 4 : vw < 1024 ? 8 : 12
      const margin = vw < 600 ? 16 : 24
      const gutter = vw < 1024 ? 16 : 24
      let html = ''
      for (let i = 0; i < cols; i++) html += '<div style="flex:1;background:rgba(255,64,160,.10);border-inline:1px solid rgba(255,64,160,.28)"></div>'
      fixedLayer('display:flex;gap:' + gutter + 'px;padding:0 ' + margin + 'px;box-sizing:border-box;max-width:1328px;left:50%;transform:translateX(-50%)', html)
      break
    }
    case 'baseline':
      fixedLayer('background:repeating-linear-gradient(to bottom,transparent 0 7px,rgba(92,168,255,.35) 7px 8px)')
      break
    case 'thumb':
    case 'thumb-left': {
      // One-handed reach only means something on a device held in the hand.
      if (!matchMedia('(pointer: coarse)').matches) break
      const x = id === 'thumb' ? '82%' : '18%'
      fixedLayer(
        'z-index:2147483645;background:radial-gradient(ellipse 125% 78% at ' + x + ' 106%,rgba(61,220,151,.26) 0 52%,rgba(245,184,61,.26) 52% 78%,rgba(255,92,92,.28) 78% 100%)',
        '<div style="position:absolute;top:8px;' + (id === 'thumb' ? 'left' : 'right') + ':8px;padding:3px 7px;border-radius:5px;background:#14161a;color:#e8eaed;font:600 10px/1.5 system-ui">easy · stretch · hard</div>'
      )
      break
    }
    case 'safe-area': {
      const band = (side: string, size: string): string =>
        '<div style="position:absolute;' + side + ';' + size + ';background:repeating-linear-gradient(45deg,rgba(255,92,92,.45) 0 6px,rgba(255,92,92,.18) 6px 12px)"></div>'
      fixedLayer(
        '',
        band('top:0;left:0;right:0', 'height:env(safe-area-inset-top)') +
          band('bottom:0;left:0;right:0', 'height:env(safe-area-inset-bottom)') +
          band('top:0;bottom:0;left:0', 'width:env(safe-area-inset-left)') +
          band('top:0;bottom:0;right:0', 'width:env(safe-area-inset-right)')
      )
      break
    }
    case 'tap':
      live((p) =>
        each('a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="link"],[role="menuitem"],[onclick]', (el) => {
          const r = el.getBoundingClientRect()
          const min = Math.min(r.width, r.height)
          mark(p, el, min < 24 ? RED : min < 44 ? AMBER : GREEN, Math.round(r.width) + '×' + Math.round(r.height), true)
        })
      )
      break
    case 'small-text':
      live((p) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const seen = new Set<Element>()
        for (let node = walker.nextNode(), n = 0; node && n < 5000; node = walker.nextNode(), n++) {
          const el = node.parentElement
          if (!el || seen.has(el) || !(node.nodeValue || '').trim()) continue
          seen.add(el)
          const size = parseFloat(getComputedStyle(el).fontSize)
          if (size < 12) mark(p, el, RED, Math.round(size * 10) / 10 + 'px', true)
        }
      })
      break
    case 'zindex':
      live((p) =>
        each('body *', (el) => {
          const z = getComputedStyle(el).zIndex
          if (z !== 'auto' && el.localName !== 'facet-overlay') mark(p, el, BLUE, 'z ' + z)
        }, 4000)
      )
      break
    case 'containers':
      live((p) =>
        each('body *', (el) => {
          const d = getComputedStyle(el).display
          if (d.indexOf('grid') >= 0) mark(p, el, PINK, 'grid')
          else if (d.indexOf('flex') >= 0) mark(p, el, BLUE, 'flex')
        }, 4000)
      )
      break
    case 'overflow':
      live((p) => {
        const vw = root.clientWidth
        each('body *', (el) => {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') mark(p, el, RED, '+' + Math.round(r.right - vw) + 'px', true)
        }, 4000)
      })
      break
    case 'alt':
      live((p) =>
        each('img', (el) => {
          const img = el as HTMLImageElement
          if (!img.hasAttribute('alt')) mark(p, img, RED, 'missing alt', true)
          else mark(p, img, img.alt ? GREEN : AMBER, img.alt ? 'alt: ' + img.alt : 'alt="" (decorative)')
        })
      )
      break
    case 'headings':
      live((p) => each('h1,h2,h3,h4,h5,h6,[role="heading"]', (el) => mark(p, el, AMBER, (el.getAttribute('aria-level') ? 'H' + el.getAttribute('aria-level') : el.localName.toUpperCase()))))
      break
    case 'landmarks':
      live((p) =>
        each('header,nav,main,aside,footer,search,[role="banner"],[role="navigation"],[role="main"],[role="complementary"],[role="contentinfo"],[role="search"],[role="region"]', (el) => {
          const label = el.getAttribute('aria-label')
          mark(p, el, GREEN, (el.getAttribute('role') || el.localName) + (label ? ' “' + label + '”' : ''))
        })
      )
      break
    case 'focus-order':
      live((p) => {
        const items = Array.from(document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]'))
          .filter((el) => el.tabIndex >= 0 && el.getBoundingClientRect().width > 0)
          .slice(0, 400)
        // Positive tabindex values come first, in numeric order, then document order.
        const ordered = items.filter((el) => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex).concat(items.filter((el) => el.tabIndex === 0))
        ordered.forEach((el, i) => mark(p, el, el.tabIndex > 0 ? RED : BLUE, String(i + 1)))
      })
      break
    case 'edit':
      document.designMode = 'on'
      store[id] = () => (document.designMode = 'off')
      break
    case 'rtl': {
      const before = root.getAttribute('dir')
      root.setAttribute('dir', 'rtl')
      store[id] = () => (before === null ? root.removeAttribute('dir') : root.setAttribute('dir', before))
      break
    }
    case 'no-css': {
      const sheets = Array.from(document.styleSheets).filter((s) => !s.disabled)
      sheets.forEach((s) => (s.disabled = true))
      store[id] = () => sheets.forEach((s) => (s.disabled = false))
      break
    }
    case 'chaos-long':
    case 'chaos-short': {
      const originals: Array<[Text, string]> = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(), n = 0; node && n < 4000; node = walker.nextNode(), n++) {
        const text = node.nodeValue || ''
        const parent = node.parentElement
        if (!text.trim() || !parent || /^(script|style|noscript|textarea|title)$/.test(parent.localName)) continue
        originals.push([node as Text, text])
        const words = text.trim().split(/\s+/)
        node.nodeValue = id === 'chaos-long' ? text + ' ' + words.concat(words).slice(0, Math.max(2, Math.ceil(words.length * 0.8))).join(' ') : words.slice(0, Math.max(1, Math.ceil(words.length * 0.4))).join(' ')
      }
      store[id] = () => originals.forEach(([node, text]) => (node.nodeValue = text))
      break
    }
  }
}
