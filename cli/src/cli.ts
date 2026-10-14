import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { Issue } from '@shared/types'
import { checkResponsive, launchBrowser, screenshots, toUrl, type CheckReport } from './browser'
import { DEFAULT_SUITE, listDevices, resolveDevices, SUITES } from './devices'
import { serveMcp } from './mcp'

declare const __VERSION__: string

const HELP = `facet-check ${__VERSION__}
Check a web page for responsive design problems on real device viewports.

Usage
  facet-check <url> [options]       check a page (URL, localhost:3000, or ./file.html)
  facet-check mcp                   run as an MCP server over stdio, for AI agents
  facet-check --list-devices [query]

Options
  -d, --devices <list>     comma-separated device ids, names, sizes (1024x768)
                           or presets: ${SUITES.map((s) => s.id).join(', ')}
                           (default: ${DEFAULT_SUITE})
  -s, --screenshots <dir>  save a PNG of each device into <dir>
      --full-page          capture the whole page, not only the first screen
      --json               print the full report as JSON
      --all                also list info-level findings
      --fail-on <level>    exit 1 if any finding is at least: error (default), warn, info, never
      --timeout <ms>       page load timeout (default 30000)
  -h, --help               show this help
  -v, --version            show the version

Examples
  npx facet-check example.com
  npx facet-check localhost:3000 -d phones --screenshots shots
  npx facet-check https://example.com -d iphone-17,ipad,1440x900 --json`

const RANK: Record<Issue['severity'] | 'never', number> = { info: 1, warn: 2, error: 3, never: 9 }
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: number) => (s: string): string => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const red = paint(31)
const yellow = paint(33)
const green = paint(32)
const dim = paint(2)
const bold = paint(1)

function printReport(report: CheckReport, all: boolean): void {
  const { summary } = report
  const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [count(summary.devices, 'device'), count(summary.errors, 'error'), count(summary.warnings, 'warning')]
  if (all) parts.push(count(summary.info, 'note'))
  console.log(`${bold('Facet check')} ${report.url}\n${dim(parts.join(' · '))}\n`)
  for (const r of report.devices) {
    const d = r.device
    const label = `${d.name} ${dim(`${d.width}×${d.height} @${d.pixelRatio}x`)}`
    if (r.error) {
      console.log(`${red('✗')} ${label}\n  ${red('could not load:')} ${r.error}\n`)
      continue
    }
    const shown = r.issues.filter((i) => all || i.severity !== 'info')
    const mark = shown.some((i) => i.severity === 'error') ? red('✗') : shown.length ? yellow('!') : green('✓')
    console.log(`${mark} ${label}${r.status && r.status >= 400 ? red(` HTTP ${r.status}`) : ''}${shown.length ? '' : dim('  no problems found')}`)
    for (const issue of shown) {
      const tag = issue.severity === 'error' ? red('error') : issue.severity === 'warn' ? yellow('warn ') : dim('note ')
      console.log(`  ${tag} ${issue.title}${issue.detail ? dim(' — ' + issue.detail) : ''}`)
      if (issue.selector) console.log(`        ${dim(issue.selector)}`)
      if (issue.hint) console.log(`        ${dim('fix: ' + issue.hint)}`)
    }
    for (const message of r.console.slice(0, 5)) console.log(`  ${red('console')} ${message}`)
    console.log('')
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      devices: { type: 'string', short: 'd', multiple: true },
      screenshots: { type: 'string', short: 's' },
      'full-page': { type: 'boolean' },
      json: { type: 'boolean' },
      all: { type: 'boolean' },
      'fail-on': { type: 'string', default: 'error' },
      timeout: { type: 'string', default: '30000' },
      'list-devices': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' }
    }
  })

  if (values.version) {
    console.log(__VERSION__)
    return 0
  }
  if (values['list-devices']) {
    const list = listDevices(positionals[0])
    if (values.json) console.log(JSON.stringify({ presets: SUITES, devices: list }, null, 2))
    else {
      for (const s of SUITES) console.log(`${bold(s.id.padEnd(10))} ${dim(s.devices.join(', '))}`)
      console.log('')
      for (const d of list) console.log(`${d.id.padEnd(28)} ${d.name.padEnd(34)} ${dim(`${d.width}×${d.height} @${d.pixelRatio}x`)}`)
    }
    return 0
  }
  if (positionals[0] === 'mcp') {
    await serveMcp()
    return -1
  }
  if (values.help || positionals.length !== 1) {
    console.log(HELP)
    return values.help ? 0 : 2
  }
  const failOn = values['fail-on'] as keyof typeof RANK
  if (!(failOn in RANK)) throw new Error(`--fail-on must be one of ${Object.keys(RANK).join(', ')}`)

  const url = toUrl(positionals[0])
  const devices = resolveDevices(values.devices)
  const timeout = Number(values.timeout) || 30_000
  const browser = await launchBrowser()
  try {
    const report = await checkResponsive(browser, url, devices, { timeout })
    if (values.screenshots) {
      mkdirSync(values.screenshots, { recursive: true })
      for (const shot of await screenshots(browser, url, devices, { timeout, fullPage: values['full-page'] })) {
        if (shot.image) writeFileSync(join(values.screenshots, `${shot.device.id}.png`), shot.image)
      }
    }
    if (values.json) console.log(JSON.stringify(report, null, 2))
    else {
      printReport(report, !!values.all)
      if (values.screenshots) console.log(dim(`Screenshots saved to ${values.screenshots}/`))
    }
    if (report.devices.every((r) => r.error)) return 2
    const worst = Math.max(0, ...report.devices.flatMap((r) => [...r.issues.map((i) => RANK[i.severity]), r.error ? RANK.error : 0]))
    return worst >= RANK[failOn] ? 1 : 0
  } finally {
    await browser.close()
  }
}

main().then(
  (code) => {
    if (code >= 0) process.exitCode = code
  },
  (err: Error) => {
    console.error(`facet-check: ${err.message}`)
    process.exitCode = 2
  }
)
