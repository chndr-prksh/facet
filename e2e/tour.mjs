// Visual tour: drives the built app through its screens and saves a
// screenshot of each to e2e/artifacts for review. No assertions.
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const artifacts = join(here, 'artifacts')
mkdirSync(artifacts, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = process.argv.slice(2)

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  let body
  try {
    body = readFileSync(join(here, 'fixture', new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')))
  } catch {
    return void res.writeHead(404).end('not found')
  }
  res.writeHead(200, { 'content-type': TYPES[extname(req.url.split('?')[0])] ?? 'text/html' })
  res.end(body)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const site = `http://127.0.0.1:${server.address().port}`

const userData = mkdtempSync(join(tmpdir(), 'facet-tour-'))
writeFileSync(join(userData, 'state.json'), JSON.stringify({ settings: { screenshotDir: join(userData, 'shots') } }))
const app = await electron.launch({ args: [join(here, '..')], env: { ...process.env, FACET_E2E: '1', FACET_USER_DATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (err) => errors.push(err.message))
win.on('console', (msg) => msg.type() === 'error' && !/404/.test(msg.text()) && errors.push(msg.text()))

const command = (id) => app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('facet:command', cmd), id)
const snap = async (name) => {
  if (only.length && !only.some((o) => name.includes(o))) return
  await sleep(350)
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(join(artifacts, `tour-${name}.png`), Buffer.from(png, 'base64'))
  console.log('  saved', name)
}
const esc = () => win.keyboard.press('Escape')
const tool = (title) => win.click(`.toolbar [title^="${title}"]`)

try {
  await win.waitForSelector('.app:not(.booting)')
  await win.fill('.start-form input', site + '/index.html')
  await win.press('.start-form input', 'Enter')
  await sleep(2500)
  await snap('01-row')

  await command('view.frames')
  await snap('02-frames')
  await command('devices.rotate')
  await snap('03-frames-rotated')
  await command('devices.rotate')
  await command('view.frames')

  await command('view.layout.wrap')
  await snap('04-wrap')
  await command('view.layout.focus')
  await snap('05-focus')
  await command('view.layout.row')

  await tool('Emulation')
  await snap('06-emulation')
  await esc()
  await tool('Debug overlays')
  await snap('07-overlays')
  await esc()
  await tool('Devices and suites')
  await snap('08-devices-pop')
  await esc()
  await tool('Mirror interactions')
  await snap('09-sync')
  await esc()

  await command('devices.manage')
  await snap('10-device-manager')
  await win.click('.modal-foot .btn:not(.primary)')
  await snap('11-device-form')
  await esc()
  await command('view.palette')
  await win.keyboard.type('over')
  await snap('12-palette')
  await esc()
  await command('app.settings')
  await win.click('.settings-tabs button:nth-child(2)')
  await win.click('.settings .toggle')
  await snap('13-settings-agents')
  await win.click('.settings .toggle')
  await esc()
  await command('app.shortcuts')
  await snap('14-shortcuts')
  await esc()

  await command('overlay.thumb')
  await command('overlay.tap')
  await command('overlay.headings')
  await sleep(600)
  await snap('15-overlays-on')
  await command('overlay.thumb')
  await command('overlay.tap')
  await command('overlay.headings')

  await command('panel.seo')
  await sleep(700)
  await win.click('.side .segmented button:nth-child(2)')
  await snap('16-seo-previews')
  await command('panel.breakpoints')
  await sleep(900)
  await snap('17-breakpoints')
  await command('panel.outline')
  await sleep(600)
  await snap('18-outline')
  await command('panel.inspect')
  await win.fill('.side .panel-bar input', '.cards')
  await win.press('.side .panel-bar input', 'Enter')
  await sleep(900)
  await snap('19-element-compare')
  await command('panel.storage')
  await sleep(500)
  await snap('20-storage')
  await command('panel.inject')
  await win.fill('.side textarea[aria-label="Live CSS"]', '.hero h1 { color: #b4532a; text-decoration: underline wavy; }')
  await sleep(900)
  await snap('21-inject')
  await command('view.panel')

  await command('devices.add-responsive')
  await sleep(1500)
  await win.evaluate(() => document.querySelector('.stage:not(.inactive) .stage-scroll').scrollTo({ left: 99999 }))
  await snap('22-responsive-pane')

  await command('suite.phones')
  await sleep(2500)
  await snap('23-phones-suite')
  await command('suite.default')
  await sleep(1500)

  await win.click('.address [title^="Compare with"]')
  await win.fill('.address.compare input', site + '/about.html')
  await win.press('.address.compare input', 'Enter')
  await sleep(2500)
  await snap('24-compare')
  await tool('Screenshots')
  await win.click('.popover .menu-item:last-child')
  await sleep(2500)
  await snap('24b-diff')
  await win.click('.address.compare [title="Stop comparing"]')
  await sleep(500)

  await command('tools.studio')
  await win.waitForSelector('.studio canvas', { timeout: 15000 })
  await sleep(1200)
  await snap('25-studio')
  await esc()

  await command('view.theme')
  await command('view.panel')
  await command('panel.issues')
  await sleep(1200)
  await snap('26-light')
} catch (err) {
  console.log('tour stopped:', err.message)
  await snap('error').catch(() => {})
} finally {
  if (errors.length) console.log('host errors:\n  ' + [...new Set(errors)].join('\n  '))
  else console.log('no host errors')
  await app.close().catch(() => {})
  server.close()
  rmSync(userData, { recursive: true, force: true })
}
