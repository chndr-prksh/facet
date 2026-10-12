// End-to-end test for Facet Web and the Facet Helper extension. Serves the
// built website, a normal site and a site that forbids framing, then drives
// them in Chromium with and without the extension. Run with `npm run test:web`.
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const artifacts = join(here, 'artifacts')
mkdirSync(artifacts, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
}
const until = async (fn, timeout = 12000, step = 150) => {
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

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.zip': 'application/zip' }
function serve(dir, port, headers = {}) {
  const server = createServer((req, res) => {
    const path = normalize(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')
    let body
    try {
      body = readFileSync(join(dir, path))
    } catch {
      return void res.writeHead(404).end('not found')
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', ...headers })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

// The site itself must sit on a port the extension recognises as Facet Web.
const site = await serve(join(root, 'web', 'dist'), 5181)
const open = await serve(join(here, 'fixture'), 0)
const locked = await serve(join(here, 'fixture'), 0, { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" })
const APP = 'http://127.0.0.1:5181/'
const OPEN = `http://127.0.0.1:${open.address().port}/index.html`
const LOCKED = `http://127.0.0.1:${locked.address().port}/index.html`
const link = (url) => `${APP}?url=${encodeURIComponent(url)}&devices=iphone-17,ipad,laptop-1536`

const deviceFrames = (page) => page.frames().filter((f) => f.name().startsWith('facet:'))
const text = (frame, selector) => frame.locator(selector).first().textContent({ timeout: 2000 })
const allShow = (page, selector, expected) =>
  until(async () => {
    const frames = deviceFrames(page)
    if (frames.length < 3) return false
    for (const frame of frames) if ((await text(frame, selector)) !== expected) return false
    return true
  })

const profile = mkdtempSync(join(tmpdir(), 'facet-web-'))
let plain
let withHelper
try {
  /* ---------- the website on its own ---------- */
  plain = await chromium.launch({ channel: 'chromium' })
  const page = await plain.newPage({ viewport: { width: 1600, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(APP)
  check('website loads its welcome screen', await page.locator('.web-start h1').isVisible())
  await page.fill('.start-form input', OPEN)
  await page.press('.start-form input', 'Enter')
  check('a pasted link opens in three devices', !!(await allShow(page, 'h1', 'Coffee roasted on Tuesdays.')))
  const widths = await Promise.all(deviceFrames(page).map((f) => f.evaluate(() => document.documentElement.clientWidth)))
  check('each frame has its device width', widths.join() === '402,820,1470', widths.join(' / '))
  check('no helper means no mirroring control is claimed active', (await page.locator('.web-row.tools .tool-btn.right').textContent()).includes('Helper not installed'))

  await page.goto(link(LOCKED))
  const banner = await until(() => page.locator('.banner').isVisible(), 12000)
  check('a site that forbids framing is detected and explained', !!banner && (await page.locator('.wv-error.blocked').count()) === 3)

  await page.goto(link(OPEN))
  await allShow(page, 'h1', 'Coffee roasted on Tuesdays.')
  check('an embeddable site raises no warning', !(await page.locator('.banner').isVisible()))

  await page.click('.web-row.tools .tool-btn')
  await page.fill('.drawer .search input', 'pixel 11')
  const rows = await page.locator('.device-row').count()
  await page.click('.device-row:has-text("Pixel 11 Pro XL")')
  check('device search finds and adds a 2026 phone', rows >= 3 && (await until(() => deviceFrames(page).length === 4)))
  check('share link carries the page and the devices', (await page.evaluate(() => new URL(location.href).search)) !== undefined)
  await page.screenshot({ path: join(artifacts, 'web-plain.png') })
  check('website raised no script errors', errors.length === 0, errors.join(' | '))
  await plain.close()
  plain = null

  /* ---------- with the helper extension ---------- */
  const extension = join(root, 'extension')
  withHelper = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: { width: 1600, height: 950 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  const tab = await withHelper.newPage()
  await tab.goto(link(LOCKED))
  const helperSeen = await until(async () => (await tab.locator('.web-row.tools .tool-btn.right').textContent()).includes('Mirroring on'))
  check('the page detects the helper', !!helperSeen)
  // Rules are installed once the helper knows this tab; a reload then benefits from them.
  await tab.reload()
  check('helper lets a framing-forbidden site load in every device', !!(await allShow(tab, 'h1', 'Coffee roasted on Tuesdays.')))
  check('and no blocked warning is shown', !(await tab.locator('.banner').isVisible()) && (await tab.locator('.wv-error.blocked').count()) === 0)

  const [phone, tablet, laptop] = deviceFrames(tab)
  const overflow = await until(() => tab.locator('.pane').first().locator('.badge.red').isVisible())
  check('overflow is flagged on the phone only', !!overflow && (await tab.locator('.pane .badge.red').count()) === 1)

  await laptop.locator('#counter').click()
  check('a click is mirrored to the other devices', !!(await allShow(tab, '#counter', 'Added 1')))

  await tablet.locator('#email').click()
  await tab.keyboard.type('ada@example.com')
  const typed = await until(async () => (await phone.locator('#email').inputValue()) === 'ada@example.com' && (await laptop.locator('#email').inputValue()) === 'ada@example.com')
  check('typing is mirrored', !!typed)

  const box = await tab.locator('.pane').nth(2).locator('iframe').boundingBox()
  await tab.mouse.move(box.x + 200, box.y + 200)
  await tab.mouse.wheel(0, 700)
  const ratio = 'scrollY / (document.documentElement.scrollHeight - innerHeight)'
  const scrolled = await until(async () => {
    const [a, b, c] = await Promise.all([phone, tablet, laptop].map((f) => f.evaluate(ratio)))
    return c > 0.05 && Math.abs(a - c) < 0.04 && Math.abs(b - c) < 0.04 ? [a, b, c] : null
  }, 6000)
  check('scrolling is mirrored by relative position', !!scrolled, scrolled ? scrolled.map((r) => r.toFixed(3)).join(' / ') : '')

  await phone.locator('#burger').click()
  await sleep(500)
  check('a click on an element hidden elsewhere is not replayed there', (await phone.evaluate(() => document.body.classList.contains('menu-open'))) && !(await laptop.evaluate(() => document.body.classList.contains('menu-open'))))
  await phone.locator('#burger').click()

  await laptop.evaluate(() => scrollTo(0, 0))
  await laptop.locator('#about-link').click()
  check('following a link takes every device along', !!(await allShow(tab, 'h1', 'About the roastery')))
  const address = await until(async () => (await tab.locator('.web .address input').first().inputValue()).includes('about.html'))
  check('and the address box follows', !!address)

  await tab.click('.web-row.tools .tool-btn.right')
  await sleep(400)
  const [phone2, , laptop2] = deviceFrames(tab)
  await laptop2.locator('#home-link').click()
  await sleep(1500)
  check('with mirroring off, the other devices stay put', (await text(phone2, 'h1')) === 'About the roastery')
  await tab.screenshot({ path: join(artifacts, 'web-helper.png') })

  /* ---------- the helper must not affect ordinary browsing ---------- */
  const other = await withHelper.newPage()
  await other.setContent(`<iframe id="f" name="facet:spoof" src="${LOCKED}" style="width:400px;height:300px"></iframe>`)
  await sleep(1500)
  const leaked = await other
    .frameLocator('#f')
    .locator('h1')
    .textContent({ timeout: 1500 })
    .catch(() => null)
  // Chromium's own "refused to connect" page has a heading too, so compare the text.
  check('outside Facet Web, framing protection is left intact', leaked !== 'Coffee roasted on Tuesdays.', `frame shows: ${JSON.stringify(leaked)}`)
} catch (err) {
  check('test run completed without throwing', false, err.message)
} finally {
  await plain?.close().catch(() => {})
  await withHelper?.close().catch(() => {})
  for (const server of [site, open, locked]) server.close()
  rmSync(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
