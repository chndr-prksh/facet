// End-to-end smoke test: launches the built app against a fixture site with
// known responsive defects and checks emulation, mirroring, audits, capture
// and the MCP server. Run with `npm test`.
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const artifacts = join(here, 'artifacts')
mkdirSync(artifacts, { recursive: true })
const MCP_PORT = 12791
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
}

/* ---------- fixture server ---------- */
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  const file = join(here, 'fixture', new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html'))
  let body
  try {
    body = readFileSync(file)
  } catch {
    return void res.writeHead(404).end('not found')
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(body)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const site = `http://127.0.0.1:${server.address().port}`

/* ---------- launch ---------- */
const userData = mkdtempSync(join(tmpdir(), 'facet-e2e-'))
const shotsDir = join(userData, 'shots')
writeFileSync(join(userData, 'state.json'), JSON.stringify({ settings: { mcpEnabled: true, mcpPort: MCP_PORT, screenshotDir: shotsDir } }))

// FACET_BIN=1 tests the packaged app instead of the build output, which also
// proves the runtime dependencies made it into the bundle.
const packaged = process.env.FACET_BIN ? join(root, 'dist', `mac-${process.arch}`, 'Facet.app', 'Contents', 'MacOS', 'Facet') : null
const app = await electron.launch({
  ...(packaged ? { executablePath: packaged, args: [] } : { args: [root] }),
  env: { ...process.env, FACET_E2E: '1', FACET_USER_DATA: userData }
})
const win = await app.firstWindow()
win.on('pageerror', (err) => console.log('  [host error]', err.message))
win.on('console', (msg) => msg.type() === 'error' && console.log('  [host console]', msg.text()))

const views = () => win.evaluate(() => document.querySelectorAll('.stage:not(.inactive) webview').length)
const guest = (i, code) => win.evaluate(([index, js]) => document.querySelectorAll('.stage:not(.inactive) webview')[index].executeJavaScript(js), [i, code])
const input = (i, event) => win.evaluate(([index, ev]) => document.querySelectorAll('.stage:not(.inactive) webview')[index].sendInputEvent(ev), [i, event])
const command = (id) => app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('facet:command', cmd), id)
const snapshot = async (name) => {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(join(artifacts, `${name}.png`), Buffer.from(png, 'base64'))
}
const until = async (fn, timeout = 15000, step = 150) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const value = await fn()
      if (value) return value
    } catch {
      /* not ready */
    }
    await sleep(step)
  }
  return null
}
const clickIn = async (i, selector) => {
  const p = await guest(i, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
  await input(i, { type: 'mouseMove', x: p.x, y: p.y })
  await input(i, { type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await input(i, { type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
}
const allLoaded = (suffix) =>
  until(async () => {
    const n = await views()
    if (n < 3) return false
    for (let i = 0; i < n; i++) {
      const state = await guest(i, '({ url: location.href, ready: document.readyState })')
      if (!state.url.includes(suffix) || state.ready !== 'complete') return false
    }
    return true
  })

/** PNG files written under the screenshot folder, once there are at least `min` of them. */
function pngs(min) {
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name)
      if (statSync(file).isDirectory()) walk(file)
      else if (name.endsWith('.png')) found.push(file)
    }
  }
  try {
    walk(shotsDir)
  } catch {
    return null
  }
  return found.length >= min ? found.sort() : null
}

/** Reads pixels at fractional positions and names their colour, tolerant of colour-profile shifts. */
const sample = (file, points) =>
  app.evaluate(({ nativeImage }, [path, pts]) => {
    const image = nativeImage.createFromPath(path)
    const { width, height } = image.getSize()
    const bitmap = image.toBitmap()
    return pts.map(([fx, fy]) => {
      const i = (Math.floor(height * fy) * width + Math.floor(width * fx)) * 4
      const [r, g, b] = [bitmap[i + 2], bitmap[i + 1], bitmap[i]]
      const hi = (v) => v > 190
      const lo = (v) => v < 150
      if (r < 70 && g < 70 && b < 70) return 'K'
      if (hi(r) && hi(g) && lo(b)) return 'Y'
      if (hi(r) && hi(b) && lo(g)) return 'M'
      if (hi(g) && hi(b) && lo(r)) return 'C'
      if (hi(r) && lo(g) && lo(b)) return 'R'
      if (hi(g) && lo(r) && lo(b)) return 'G'
      if (hi(b) && lo(r) && lo(g)) return 'B'
      return `(${r},${g},${b})`
    })
  }, [file, points])

async function mcp(method, params) {
  const res = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  })
  const body = await res.text()
  const json = body.includes('data:') ? body.split('\n').filter((l) => l.startsWith('data:')).pop().slice(5) : body
  return JSON.parse(json)
}
const tool = async (name, args = {}) => (await mcp('tools/call', { name, arguments: args })).result

const hostDpr = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)

try {
  await win.waitForSelector('.app:not(.booting)', { timeout: 20000 })
  check('app boots to the start page', await win.isVisible('.start'))
  await snapshot('01-start')

  /* ---------- load a page ---------- */
  await win.fill('.start-form input', site + '/index.html')
  await win.press('.start-form input', 'Enter')
  check('all three default devices load the page', !!(await allLoaded('index.html')))
  await sleep(900)

  /* ---------- emulation ---------- */
  // clientWidth is the device width. innerWidth is not: phones grow the layout viewport to fit overflowing pages.
  const probe = '({ w: document.documentElement.clientWidth, h: screen.height, dpr: devicePixelRatio, ua: navigator.userAgent, touch: navigator.maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches, tstart: "ontouchstart" in window })'
  const [phone, tablet, laptop] = [await guest(0, probe), await guest(1, probe), await guest(2, probe)]
  check('phone reports its viewport and pixel ratio', phone.w === 402 && phone.h === 874 && phone.dpr === 3, `${phone.w}×${phone.h} @${phone.dpr}`)
  check('phone sends an iPhone user agent', /iPhone/.test(phone.ua) && !/Electron/.test(phone.ua))
  check('phone exposes touch (coarse pointer, touch points, ontouchstart)', phone.coarse && phone.touch === 5 && phone.tstart)
  check('tablet reports its viewport', tablet.w === 820 && tablet.dpr === 2 && /iPad/.test(tablet.ua), `${tablet.w}×${tablet.h} @${tablet.dpr}`)
  check('laptop reports its viewport without touch', laptop.w === 1470 && laptop.dpr === 2 && !laptop.coarse && /Macintosh/.test(laptop.ua), `${laptop.w}×${laptop.h}`)
  const zoomedOut = await guest(0, '({ inner: innerWidth, scale: visualViewport.scale })')
  check('overflowing page zooms out on the phone, as real mobile browsers do', zoomedOut.inner > 402, `layout viewport ${zoomedOut.inner}px`)
  check('desktop user agent hides Electron', !/Electron|facet/i.test(laptop.ua))

  /* ---------- live overflow detection ---------- */
  const overflowBadges = await until(() => win.evaluate(() => [...document.querySelectorAll('.stage:not(.inactive) .pane')].map((p) => !!p.querySelector('.pane-badges .badge.red svg'))))
  check('overflow badge shows on the phone only', overflowBadges && overflowBadges[0] === true && overflowBadges[2] === false, JSON.stringify(overflowBadges))

  /* ---------- mirroring: scroll ---------- */
  await input(2, { type: 'mouseMove', x: 300, y: 300 })
  await input(2, { type: 'mouseWheel', x: 300, y: 300, deltaX: 0, deltaY: -600 })
  const ratio = 'scrollY / (document.documentElement.scrollHeight - innerHeight)'
  const ratios = async () => [await guest(0, ratio), await guest(1, ratio), await guest(2, ratio)]
  const scrolled = await until(async () => {
    const [a, b, c] = await ratios()
    return c > 0.05 && Math.abs(a - c) < 0.03 && Math.abs(b - c) < 0.03 ? [a, b, c] : null
  }, 5000)
  check('scrolling one device scrolls the others to the same relative position', !!scrolled, `ratios ${(scrolled ?? (await ratios())).map((r) => r.toFixed(3)).join(' / ')}`)
  await command('tools.scroll-top')
  await sleep(400)

  /* ---------- mirroring: click, hidden-element skip ---------- */
  await clickIn(2, '#counter')
  const clicks = await until(async () => {
    const texts = [await guest(0, 'document.querySelector("#counter").textContent'), await guest(1, 'document.querySelector("#counter").textContent'), await guest(2, 'document.querySelector("#counter").textContent')]
    return texts.every((t) => t === 'Added 1') ? texts : null
  }, 5000)
  check('a click is replayed in every device exactly once', !!clicks)

  // A real pointer event aimed at the host window, to prove hit-testing survives the CSS zoom.
  const target = await win.evaluate(async () => {
    const wrap = document.querySelectorAll('.stage:not(.inactive) .wv-wrap')[1]
    const view = wrap.querySelector('webview')
    const r = await view.executeJavaScript('(() => { const b = document.querySelector("#counter").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()')
    const box = wrap.getBoundingClientRect()
    const zoom = box.width / view.offsetWidth
    return { x: box.left + r.x * zoom, y: box.top + r.y * zoom, zoom }
  })
  // Chromium routes the event to the guest and never acks the host's CDP call, so do not wait on it.
  await Promise.race([win.mouse.click(target.x, target.y), sleep(1500)])
  const viaHost = await until(async () => (await guest(1, 'document.querySelector("#counter").textContent')) === 'Added 2', 4000)
  const mirroredReal = await until(async () => (await guest(0, 'document.querySelector("#counter").textContent')) === 'Added 2', 3000)
  check(`a real pointer click lands on the right element at ${Math.round(target.zoom * 100)}% zoom`, !!viaHost)
  check('and that real click is mirrored too', !!mirroredReal)

  await clickIn(0, '#burger')
  await sleep(500)
  const menus = [await guest(0, 'document.body.classList.contains("menu-open")'), await guest(2, 'document.body.classList.contains("menu-open")')]
  check('a click on an element hidden at another viewport is not replayed there', menus[0] === true && menus[1] === false, JSON.stringify(menus))
  await clickIn(0, '#burger')
  await sleep(300)

  /* ---------- mirroring: typing ---------- */
  await guest(1, 'document.querySelector("#email").scrollIntoView({ block: "center" })')
  await sleep(300)
  await clickIn(1, '#email')
  await sleep(200)
  await win.evaluate(() => document.querySelectorAll('.stage:not(.inactive) webview')[1].insertText('ada@example.com'))
  const typed = await until(async () => {
    const values = [await guest(0, 'document.querySelector("#email").value'), await guest(2, 'document.querySelector("#email").value')]
    return values.every((v) => v === 'ada@example.com') ? values : null
  }, 5000)
  check('typing in a field is mirrored', !!typed)
  await clickIn(1, '#weekly')
  const checked = await until(async () => (await guest(0, 'document.querySelector("#weekly").checked')) && (await guest(2, 'document.querySelector("#weekly").checked')), 4000)
  check('a checkbox toggle is mirrored without double-toggling', !!checked)

  /* ---------- mirroring: navigation ---------- */
  await command('tools.scroll-top')
  await sleep(300)
  await clickIn(2, '#about-link')
  check('following a link navigates every device', !!(await allLoaded('about.html')))
  const address = await until(() => win.evaluate(() => document.querySelector('.address input').value.includes('about.html')), 4000)
  check('address bar follows the navigation', !!address)
  await command('nav.back')
  check('back returns every device to the first page', !!(await allLoaded('index.html')))
  await sleep(600)

  /* ---------- responsive audit ---------- */
  await command('view.panel')
  await win.waitForSelector('.side', { timeout: 5000 })
  const issuesText = await until(() => win.evaluate(() => (document.querySelector('.side .panel-scroll')?.textContent.includes('sideways') ? document.querySelector('.side .panel-scroll').textContent : null)), 8000)
  check('audit flags horizontal overflow on the phone', !!issuesText)
  check('audit names the overflowing element', /Extends \d+px past the viewport/.test(issuesText ?? ''))
  check('audit flags the 16px tap target', /Tap target is 1\d × 1\d/.test(issuesText ?? ''))
  check('audit flags small text', /Text is only 10px/.test(issuesText ?? ''))
  check('audit flags the iOS input zoom trap', /iOS zooms in on focus/.test(issuesText ?? ''))
  await snapshot('02-issues')

  /* ---------- accessibility ---------- */
  await win.click('.side-tabs button[title="A11y"]')
  await win.click('.side .btn.primary')
  const a11y = await until(() => win.evaluate(() => (/failing rules/.test(document.querySelector('.side .summary')?.textContent ?? '') ? document.querySelector('.side').textContent : null)), 20000)
  check('axe audit runs and reports the missing alt text', /Images must have alternat/i.test(a11y ?? ''), (a11y ?? '').match(/\d+ failing rules/)?.[0])

  /* ---------- SEO, outline, breakpoints ---------- */
  await win.click('.side-tabs button[title="SEO"]')
  const seo = await until(() => win.evaluate(() => (document.querySelector('.side .panel-scroll')?.textContent.includes('Meta description') ? document.querySelector('.side .panel-scroll').textContent : null)), 6000)
  check('SEO panel validates metadata', /Meta description/.test(seo ?? '') && /Canonical/.test(seo ?? ''))
  await win.click('.side-tabs button[title="Outline"]')
  const outline = await until(() => win.evaluate(() => (document.querySelector('.side .panel-scroll')?.textContent.includes('Coffee roasted') ? document.querySelector('.side .panel-scroll').textContent : null)), 6000)
  check('outline flags the skipped heading level', /skips a level/.test(outline ?? ''))
  await win.click('.side-tabs button[title="Breaks"]')
  const breaks = await until(() => win.evaluate(() => (document.querySelector('.side .panel-scroll')?.textContent.includes('min-width') ? document.querySelector('.side .panel-scroll').textContent : null)), 8000)
  check('breakpoints are read from the stylesheet', /768px/.test(breaks ?? '') && /1024px/.test(breaks ?? ''))
  await win.click('.side-tabs button[title="Console"]')
  const logs = await until(() => win.evaluate(() => (document.querySelector('.side .console')?.textContent.includes('Carousel failed') ? document.querySelector('.side .console').textContent : null)), 6000)
  check('console merges messages and attributes the phone-only error', /Carousel failed/.test(logs ?? '') && /iPhone 17/.test(logs ?? ''))
  await snapshot('03-console')

  /* ---------- per-tab emulation ---------- */
  await command('tools.color-scheme')
  const dark = await until(async () => (await guest(0, 'matchMedia("(prefers-color-scheme: dark)").matches')) && (await guest(2, 'matchMedia("(prefers-color-scheme: dark)").matches')), 5000)
  check('dark colour scheme applies to every device', !!dark)
  await snapshot('04-dark')
  await command('tools.color-scheme')

  /* ---------- overlays ---------- */
  await command('overlay.tap')
  const overlay = await until(() => guest(0, '!!document.querySelector(\'facet-overlay[data-id="tap"]\') && document.querySelector(\'facet-overlay[data-id="tap"]\').children.length > 3'), 5000)
  check('tap-target overlay draws in the page', !!overlay)
  await command('overlay.tap')
  const cleared = await until(async () => !(await guest(0, '!!document.querySelector(\'facet-overlay[data-id="tap"]\')')), 4000)
  check('turning an overlay off removes it', !!cleared)

  /* ---------- rotate ---------- */
  await command('devices.rotate')
  const rotated = await until(async () => {
    const s = await guest(0, '({ w: innerWidth, h: innerHeight, o: screen.orientation.type })')
    return s.w === 874 && s.h === 402 ? s : null
  }, 5000)
  check('rotating swaps the viewport and reports landscape', !!rotated && /landscape/.test(rotated.o), rotated ? `${rotated.w}×${rotated.h} ${rotated.o}` : '')
  const landscapeScale = await guest(0, 'visualViewport.scale')
  check('a rotated phone is not left zoomed in', Math.abs(landscapeScale - 1) < 0.01, `scale ${landscapeScale}`)
  await command('devices.rotate')
  await sleep(500)
  const portraitScale = await until(async () => (Math.abs((await guest(0, 'visualViewport.scale')) - 1) < 0.01 ? 1 : null), 3000)
  check('rotating back restores normal scale', portraitScale === 1)

  /* ---------- screenshots ---------- */
  await command('view.panel')
  await command('tools.screenshot-full-all')
  const shots = await until(() => pngs(3), 25000)
  check('full-page screenshots are written for every device', !!shots, shots ? shots.map((f) => f.split('/').pop()).join(', ') : '')
  if (shots) {
    const phoneShot = shots.find((f) => /iPhone/.test(f))
    const size = await app.evaluate(({ nativeImage }, file) => nativeImage.createFromPath(file).getSize(), phoneShot)
    check('phone full-page capture is device-width and taller than the viewport', size.width === 402 * Math.min(3, hostDpr) && size.height > size.width * 3, `${size.width}×${size.height}`)
  }

  /* ---------- capture correctness, verified by reading pixels ---------- */
  const opened = JSON.parse((await tool('navigate', { url: site + '/blocks.html' })).content[0].text)
  check('MCP navigate loads a page in every device and waits for it', opened.devices?.every((d) => d.url.endsWith('/blocks.html') && !d.loading))
  await sleep(400)
  rmSync(shotsDir, { recursive: true, force: true })
  await command('tools.screenshot-all')
  const viewportShots = await until(() => pngs(3), 15000)
  const QUADS = [[0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]
  for (const file of viewportShots ?? []) {
    const colours = (await sample(file, QUADS)).join('')
    check(`viewport capture of ${file.split('/').pop().replace('.png', '')} shows the four quadrants`, colours === 'RGBY', colours)
  }
  rmSync(shotsDir, { recursive: true, force: true })
  await command('tools.screenshot-full-all')
  const fullShots = await until(() => pngs(3), 25000)
  // Three viewports tall: quadrants, then magenta, then cyan. The fixed black bar belongs at the very top only.
  const BANDS = [[0.5, 0.004], [0.25, 0.1], [0.75, 0.1], [0.25, 0.25], [0.75, 0.25], [0.5, 0.34], [0.5, 0.5], [0.5, 0.64], [0.5, 0.7], [0.5, 0.95]]
  for (const file of fullShots ?? []) {
    const colours = (await sample(file, BANDS)).join('')
    check(`full-page capture of ${file.split('/').pop().replace(' full.png', '')} is stitched in order, fixed bar once`, colours === 'KRGBYMMMCC', colours)
  }
  const scrollAfter = await guest(0, 'scrollY')
  check('full-page capture puts the scroll position back', scrollAfter === 0, `scrollY ${scrollAfter}`)
  await tool('navigate', { url: site + '/index.html' })
  await sleep(400)

  /* ---------- MCP ---------- */
  const listed = await mcp('tools/list', {})
  check('MCP server lists its tools', (listed.result?.tools?.length ?? 0) >= 15, `${listed.result?.tools?.length} tools`)
  const state = JSON.parse((await tool('get_state')).content[0].text)
  check('MCP get_state describes the open devices', state.devices?.length === 3 && state.devices[0].width === 402)
  const audit = JSON.parse((await tool('audit_responsive')).content[0].text)
  const phoneAudit = audit.devices.find((d) => /iPhone/.test(d.device))
  check('MCP audit_responsive returns the phone overflow', phoneAudit?.issues.some((i) => i.rule === 'overflow-x'), `${phoneAudit?.errors} errors on phone`)

  const shot = await tool('screenshot', { device: 'iPhone 17' })
  check('MCP screenshot returns an image', shot.content.some((c) => c.type === 'image' && c.data.length > 2000))
  check('phone viewport capture is device-sized even while zoomed out', /402×874 CSS px/.test(shot.content[0].text), shot.content[0].text)
  writeFileSync(join(artifacts, 'phone-viewport.jpg'), Buffer.from(shot.content.find((c) => c.type === 'image').data, 'base64'))
  const set = JSON.parse((await tool('set_devices', { devices: ['Pixel 10', '1024x768'] })).content[0].text)
  check('MCP set_devices swaps the open devices', set.devices?.length === 2 && set.devices[1].width === 1024, set.devices?.map((d) => d.name).join(', '))
  const clicked = await tool('click', { selector: '#counter' })
  const mirrored = await until(async () => (await guest(1, 'document.querySelector("#counter").textContent')) === 'Added 1', 5000)
  check('MCP click is trusted and mirrored', !clicked.isError && !!mirrored)
  const blocked = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })
  check('MCP server rejects cross-origin requests', blocked.status === 403)

  /* ---------- tabs ---------- */
  await command('tab.new')
  const tabCount = await until(() => win.evaluate(() => (document.querySelectorAll('.tab').length === 2 ? 2 : null)), 4000)
  check('a new tab opens alongside the first', tabCount === 2)
  await command('tab.close')
  await sleep(400)
  await snapshot('05-final')
} catch (err) {
  check('test run completed without throwing', false, err.message)
  await snapshot('error').catch(() => {})
} finally {
  await app.close().catch(() => {})
  server.close()
  rmSync(userData, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
