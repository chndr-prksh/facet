// End-to-end test for facet-check, the command-line tool and stdio MCP
// server in cli/. Serves the fixture site and runs the built CLI against it.
// Run with `npm run test:cli`.
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'cli', 'dist', 'facet-check.js')

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  const path = normalize(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')
  try {
    const body = readFileSync(join(here, 'fixture', path))
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const HOST = `127.0.0.1:${server.address().port}`
const SITE = `http://${HOST}`

/** Runs the CLI and resolves with its exit code and output; never rejects. */
const run = (...args) =>
  new Promise((resolve) =>
    execFile(process.execPath, [bin, ...args], { timeout: 120_000, maxBuffer: 20e6 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout, stderr })
    )
  )

/** Names the colour at fractional positions of an image, tolerant of colour-profile shifts. */
let reader
async function sample(image, mime, points) {
  reader ??= await (await chromium.launch({ channel: 'chromium' })).newPage()
  return reader.evaluate(
    async ([src, pts]) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight })
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const name = ([r, g, b]) => {
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
      }
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        colours: pts.map(([fx, fy]) => name(ctx.getImageData(Math.floor(img.naturalWidth * fx), Math.floor(img.naturalHeight * fy), 1, 1).data)).join('')
      }
    },
    [`data:${mime};base64,${image.toString('base64')}`, points]
  )
}
const QUADRANTS = [[0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]

const shots = mkdtempSync(join(tmpdir(), 'facet-cli-'))
let client
try {
  /* ---------- command line ---------- */
  const json = await run(`${SITE}/index.html`, '-d', 'iphone-17,1440x900', '--json')
  const report = JSON.parse(json.stdout || '{}')
  const [phone, wide] = report.devices ?? []
  check('the JSON report covers each requested device', phone?.device.id === 'iphone-17' && wide?.device.width === 1440, `${report.devices?.length} devices`)
  check('the phone gets its own viewport and pixel ratio', phone?.device.width === 402 && phone?.device.pixelRatio === 3)
  const overflow = phone?.issues.find((i) => i.rule === 'overflow-x')
  check('sideways scrolling is found on the phone', overflow?.severity === 'error', overflow?.title)
  check('and blamed on the price table', !!phone?.issues.some((i) => i.rule === 'overflow-element' && /table/.test(i.selector ?? '')))
  check('a small tap target is found on the touch device', !!phone?.issues.some((i) => i.rule === 'tap-target'))
  check('the iOS zoom rule applies to the iPhone', !!phone?.issues.some((i) => i.rule === 'ios-input-zoom'))
  check('the wide desktop does not scroll sideways', !!wide && !wide.issues.some((i) => i.rule === 'overflow-x'))
  check('tap targets are not judged on a mouse-driven desktop', !!wide && !wide.issues.some((i) => i.rule === 'tap-target'))
  check('a console error logged only on small screens is reported there', !!phone?.console.some((m) => /Carousel/.test(m)) && !wide?.console.some((m) => /Carousel/.test(m)))
  check('exit code 1 when errors are found', json.code === 1, `exit ${json.code}`)
  check('summary counts match the findings', report.summary?.errors === report.devices?.reduce((n, d) => n + d.issues.filter((i) => i.severity === 'error').length, 0))

  const lenient = await run(`${HOST}/index.html`, '-d', 'iphone-17', '--fail-on', 'never')
  check('a bare host is loaded over http, and text output names the problem', /Page scrolls sideways/.test(lenient.stdout), lenient.stdout.split('\n')[0])
  check('--fail-on never exits 0', lenient.code === 0, `exit ${lenient.code}`)

  const presets = await run(`${SITE}/blocks.html`, '-d', 'phones', '--json')
  check('a preset name expands to its devices', JSON.parse(presets.stdout || '{}').devices?.length === 6)
  check('a clean page passes with exit code 0', presets.code === 0, `exit ${presets.code}`)

  const unknown = await run(`${SITE}/index.html`, '-d', 'iphone-99-ultra')
  check('an unknown device is a usage error with a suggestion', unknown.code === 2 && /Unknown device/.test(unknown.stderr) && /iphone/.test(unknown.stderr), unknown.stderr.trim())

  const unreachable = await run('127.0.0.1:9/index.html', '-d', 'iphone-17', '--timeout', '5000')
  check('an unreachable page exits 2 and says why', unreachable.code === 2 && /could not load/.test(unreachable.stdout), `exit ${unreachable.code}`)

  await run(`${SITE}/blocks.html`, '-d', 'iphone-17,1024x768', '--screenshots', shots, '--fail-on', 'never')
  const phoneShot = join(shots, 'iphone-17.png')
  check('--screenshots writes one PNG per device', existsSync(phoneShot) && existsSync(join(shots, '1024x768.png')))
  if (existsSync(phoneShot)) {
    const read = await sample(readFileSync(phoneShot), 'image/png', QUADRANTS)
    check('the phone screenshot is at device resolution', read.width === 402 * 3 && read.height === 874 * 3, `${read.width}×${read.height}`)
    check('and shows the right colours in each quadrant', read.colours === 'RGBY', read.colours)
  }
  rmSync(shots, { recursive: true, force: true })
  await run(`${SITE}/blocks.html`, '-d', 'iphone-17', '--screenshots', shots, '--full-page', '--fail-on', 'never')
  if (existsSync(phoneShot)) {
    const read = await sample(readFileSync(phoneShot), 'image/png', [[0.5, 0.2], [0.5, 0.5], [0.5, 0.85]])
    check('--full-page captures all three screens of the page', read.height === 874 * 3 * 3 && read.colours.endsWith('MC'), `${read.width}×${read.height} ${read.colours}`)
  } else check('--full-page captures all three screens of the page', false, 'no file')

  const listed = await run('--list-devices', 'pixel', '--json')
  check('--list-devices filters the catalogue', JSON.parse(listed.stdout || '{}').devices?.every((d) => /pixel/i.test(d.name)))

  /* ---------- MCP server over stdio ---------- */
  client = new Client({ name: 'facet-test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp'], stderr: 'ignore' }))
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort().join(',')
  check('the MCP server lists its five tools', names === 'audit_accessibility,check_responsive,compare_element,list_devices,screenshot', names)

  const call = (name, args) => client.callTool({ name, arguments: args })
  const checked = await call('check_responsive', { url: `${SITE}/index.html`, devices: ['iphone-17', 'macbook-air-13'] })
  const mcpReport = JSON.parse(checked.content[0].text)
  check('check_responsive reports the overflow on the phone only', mcpReport.summary.devicesWithErrors.join() === 'iPhone 17', mcpReport.summary.devicesWithErrors.join())

  const pictures = await call('screenshot', { url: `${SITE}/blocks.html` })
  const images = pictures.content.filter((c) => c.type === 'image')
  const labels = pictures.content.filter((c) => c.type === 'text').map((c) => c.text)
  check('screenshot returns a labelled image for each default device', images.length === 3 && labels.length === 3, labels.join(' | '))
  if (images[0]) {
    const read = await sample(Buffer.from(images[0].data, 'base64'), images[0].mimeType, QUADRANTS)
    check('MCP images are at CSS size and show the page', read.width === 402 && read.colours === 'RGBY', `${read.width}×${read.height} ${read.colours}`)
  }

  const measured = await call('compare_element', { url: `${SITE}/index.html`, selector: '.prices', devices: ['iphone-17', '1440x900'] })
  const widths = JSON.parse(measured.content[0].text).map((r) => r.element?.rect.width)
  check('compare_element measures the element on every device', widths.length === 2 && widths.every((w) => w > 0), widths.join(' / '))

  const a11y = await call('audit_accessibility', { url: `${SITE}/index.html` })
  const axe = JSON.parse(a11y.content[0].text)
  check('audit_accessibility runs axe-core', Array.isArray(axe.violations) && axe.passes > 0, `${axe.violations?.length} violations, ${axe.passes} passes`)

  const bad = await call('check_responsive', { url: `${SITE}/index.html`, devices: ['not-a-device'] })
  check('a bad device comes back as a tool error, not a crash', bad.isError === true && /Unknown device/.test(bad.content[0].text))

  const devices = await call('list_devices', { kind: 'tablet' })
  const listing = JSON.parse(devices.content[0].text)
  check('list_devices filters by kind and includes the presets', listing.count > 10 && listing.devices.every((d) => d.kind === 'tablet') && listing.presets.length > 0, `${listing.count} tablets`)
} catch (err) {
  check('test run completed without throwing', false, err.message)
} finally {
  await client?.close().catch(() => {})
  await reader?.context().browser()?.close().catch(() => {})
  server.close()
  rmSync(shots, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
