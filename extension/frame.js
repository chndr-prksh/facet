/*
 * Facet Helper, device frame script. Injected everywhere, but it does nothing
 * unless this document is a device frame of Facet Web: a direct child of the
 * top page, carrying the name Facet gave it, in a tab the background worker
 * recognises.
 *
 * In a device frame it mirrors the user's scrolling, clicks and typing to the
 * sibling frames, replays theirs, and reports the page's address and whether
 * it overflows sideways.
 */
;(() => {
  if (window.top === window || window.parent !== window.top || !window.name.startsWith('facet:')) return
  const pane = window.name.slice(6)
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => {})
  const now = () => performance.now()

  /* ---------- selectors ---------- */

  const uniqueId = (id) => {
    try {
      return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1
    } catch {
      return false
    }
  }
  /** A selector that finds the same element in a sibling frame showing the same page. */
  const cssPath = (el) => {
    const parts = []
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id && uniqueId(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        return parts.join(' > ')
      }
      const parent = node.parentElement
      if (!parent) break
      const twins = Array.from(parent.children).filter((c) => c.localName === node.localName)
      parts.unshift(twins.length > 1 ? `${node.localName}:nth-of-type(${twins.indexOf(node) + 1})` : node.localName)
    }
    return parts.length ? `html > ${parts.join(' > ')}` : 'html'
  }
  const find = (selector) => {
    try {
      return selector ? document.querySelector(selector) : null
    } catch {
      return null
    }
  }

  /* ---------- mirroring ---------- */

  let lastInput = 0
  let pointerInside = false
  let suppressScrollUntil = 0
  let applying = 0
  let lastClickSent = 0
  let lastActiveSent = 0

  const userDriven = () => pointerInside || now() - lastInput < 1500
  const markActive = () => {
    lastInput = now()
    if (lastInput - lastActiveSent > 400) {
      lastActiveSent = lastInput
      send({ facet: 'active' })
    }
  }
  for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel']) window.addEventListener(type, markActive, { capture: true, passive: true })
  window.addEventListener('mousemove', () => (pointerInside = true), { capture: true, passive: true })
  document.addEventListener('mouseleave', () => (pointerInside = false))
  window.addEventListener('blur', () => (pointerInside = false))

  /** How far an element can scroll; the document is measured against the window. */
  const scrollRange = (el) => {
    const isDocument = el === document.scrollingElement
    return [el.scrollWidth - (isDocument ? window.innerWidth : el.clientWidth), el.scrollHeight - (isDocument ? window.innerHeight : el.clientHeight)]
  }

  const pendingScroll = new Set()
  let scrollFrame = 0
  const flushScroll = () => {
    scrollFrame = 0
    for (const target of pendingScroll) {
      const el = target === document ? document.scrollingElement : target
      if (!el) continue
      const [maxX, maxY] = scrollRange(el)
      // Position is sent as a fraction, so pages of different heights stay in step.
      send({ facet: 'sync', event: { type: 'scroll', selector: target === document ? undefined : cssPath(el), yr: maxY > 0 ? el.scrollTop / maxY : 0, xr: maxX > 0 ? el.scrollLeft / maxX : 0 } })
    }
    pendingScroll.clear()
  }
  document.addEventListener(
    'scroll',
    (e) => {
      // Scroll events carry no "who did this" flag, so replays are told apart by timing.
      if (now() < suppressScrollUntil || !userDriven()) return
      pendingScroll.add(e.target === document ? document : e.target)
      if (!scrollFrame) scrollFrame = requestAnimationFrame(flushScroll)
    },
    { capture: true, passive: true }
  )

  const INTERACTIVE = 'a[href],button,summary,label,select,[role="button"],[role="tab"],[role="menuitem"],[role="link"],[role="switch"],[role="checkbox"],[onclick]'
  document.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || applying) return
      const target = e.composedPath()[0]
      if (!(target instanceof Element)) return
      lastClickSent = now()
      send({ facet: 'sync', event: { type: 'click', selector: cssPath(target.closest(INTERACTIVE) ?? target) } })
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
        send({ facet: 'sync', event: { type: 'input', selector: cssPath(el), value: el.value, checked: toggles ? el.checked : undefined } })
      } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        send({ facet: 'sync', event: { type: 'input', selector: cssPath(el), value: el.value } })
      }
    },
    true
  )
  document.addEventListener(
    'submit',
    (e) => {
      // A submit caused by clicking its button was already mirrored as that click.
      if (!e.isTrusted || applying || now() - lastClickSent < 120) return
      if (e.target instanceof HTMLFormElement) send({ facet: 'sync', event: { type: 'submit', selector: cssPath(e.target) } })
    },
    true
  )

  const nativeSetter = (proto, prop) => Object.getOwnPropertyDescriptor(proto, prop)?.set

  function replay(evt) {
    applying++
    try {
      if (evt.type === 'scroll') {
        const el = evt.selector ? find(evt.selector) : document.scrollingElement
        if (!el) return
        suppressScrollUntil = now() + 200
        const [maxX, maxY] = scrollRange(el)
        el.scrollTo({ top: (evt.yr ?? 0) * maxY, left: (evt.xr ?? 0) * maxX, behavior: 'instant' })
        return
      }
      const el = find(evt.selector)
      if (!el) return
      if (evt.type === 'click') {
        const rect = el.getBoundingClientRect()
        // Not rendered at this size (a menu button that only exists on phones, say).
        if (rect.width === 0 && rect.height === 0) return
        const init = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
        el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }))
        el.dispatchEvent(new MouseEvent('mousedown', init))
        el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }))
        el.dispatchEvent(new MouseEvent('mouseup', init))
        el.click()
      } else if (evt.type === 'input') {
        if (el instanceof HTMLInputElement && evt.checked !== undefined) {
          if (el.checked === evt.checked) return
          nativeSetter(HTMLInputElement.prototype, 'checked')?.call(el, evt.checked)
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          if (el.value === evt.value) return
          // Through the prototype setter, so framework-controlled inputs notice the change.
          const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
          nativeSetter(proto, 'value')?.call(el, evt.value ?? '')
        } else return
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else if (evt.type === 'submit' && el instanceof HTMLFormElement) el.requestSubmit()
    } catch {
      /* one page's quirk must never break mirroring */
    } finally {
      applying--
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.facet === 'sync') replay(message.event)
  })

  /* ---------- reporting ---------- */

  let reportTimer = 0
  let lastReport = ''
  const report = () => {
    const root = document.documentElement
    if (!root) return
    const clipped = (el) => !!el && /hidden|clip/.test(getComputedStyle(el).overflowX)
    const overflow = clipped(root) || clipped(document.body) ? 0 : Math.max(0, root.scrollWidth - root.clientWidth - 1)
    const message = { facet: 'frame', pane, url: location.href, overflow: overflow > 0 ? overflow + 1 : 0 }
    const key = JSON.stringify(message)
    if (key === lastReport) return
    lastReport = key
    send(message)
  }
  const scheduleReport = () => {
    clearTimeout(reportTimer)
    reportTimer = setTimeout(report, 350)
  }

  const boot = () => {
    report()
    new MutationObserver(scheduleReport).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    window.addEventListener('resize', scheduleReport)
    window.addEventListener('load', scheduleReport)
    // Single-page apps change address without loading a document.
    window.addEventListener('popstate', scheduleReport)
    window.addEventListener('hashchange', scheduleReport)
    setInterval(report, 1500)
  }

  // Only wake up in a tab the background worker recognises as Facet Web.
  chrome.runtime
    .sendMessage({ facet: 'hello' })
    .then((reply) => {
      if (!reply?.host) return
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
      else boot()
    })
    .catch(() => {})
})()
