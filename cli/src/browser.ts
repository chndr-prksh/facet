import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright-core'
import { userAgentFor } from '@shared/devices'
import type { Device, Issue } from '@shared/types'
import { auditPage, measureElement, runAxe, type A11yViolation, type ElementReport } from '../../src/renderer/src/lib/scripts'
import { summarize, type DeviceSummary } from './devices'

/**
 * Launches a headless Chromium: FACET_CHROME if set, then Playwright's own
 * Chromium, then an installed Chrome or Edge. Most machines have one of these.
 */
export async function launchBrowser(): Promise<Browser> {
  const attempts: Array<[string, () => Promise<Browser>]> = []
  if (process.env.FACET_CHROME) attempts.push([process.env.FACET_CHROME, () => chromium.launch({ executablePath: process.env.FACET_CHROME })])
  attempts.push(["Playwright's Chromium", () => chromium.launch()])
  attempts.push(['Google Chrome', () => chromium.launch({ channel: 'chrome' })])
  attempts.push(['Microsoft Edge', () => chromium.launch({ channel: 'msedge' })])
  for (const [, launch] of attempts) {
    try {
      return await launch()
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    `No Chromium-based browser found (tried ${attempts.map(([name]) => name).join(', ')}). ` +
      'Install Google Chrome, run `npx playwright install chromium`, or set FACET_CHROME to a Chrome executable.'
  )
}

/** Turns command-line input into a URL: bare hosts get a scheme, local paths become file URLs. */
export function toUrl(input: string): string {
  const raw = input.trim()
  if (/^(https?|file|data):/i.test(raw)) return raw
  const path = raw.replace(/^~(?=\/)/, homedir())
  if (/^(\.{0,2}\/|~\/)/.test(raw) || existsSync(path)) return pathToFileURL(resolve(path)).href
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w-]+\.(localhost|local|test))(:\d+)?(\/|$)/i.test(raw) || /^\d{1,3}(\.\d{1,3}){3}/.test(raw)) return `http://${raw}`
  if (/^:\d{2,5}/.test(raw)) return `http://localhost${raw}`
  return `https://${raw}`
}

export interface LoadOptions {
  timeout?: number
}

/** Opens `url` in a fresh context that emulates `device`, and waits for it to settle. */
async function openPage(browser: Browser, device: Device, url: string, opts: LoadOptions, messages: string[]): Promise<{ page: Page; status: number }> {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    screen: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: device.mobile,
    hasTouch: device.touch,
    userAgent: device.userAgent || userAgentFor(device.os, device.mobile, browser.version()) || undefined,
    ignoreHTTPSErrors: true
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && messages.length < 20) messages.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => messages.length < 20 && messages.push(`Uncaught ${e.name}: ${e.message}`.slice(0, 300)))
  page.on('requestfailed', (r) => messages.length < 20 && messages.push(`Failed to load ${r.url().slice(0, 200)} (${r.failure()?.errorText ?? 'error'})`))
  const response = await page.goto(url, { waitUntil: 'load', timeout: opts.timeout ?? 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  return { page, status: response?.status() ?? 0 }
}

/** Runs `fn` for every device, a few at a time, closing each page afterwards. */
async function eachDevice<T>(
  browser: Browser,
  devices: Device[],
  url: string,
  opts: LoadOptions,
  fn: (page: Page, device: Device) => Promise<T>
): Promise<Array<{ device: Device; status: number; messages: string[]; value?: T; error?: string }>> {
  const out: Array<{ device: Device; status: number; messages: string[]; value?: T; error?: string }> = []
  const queue = devices.map((device, index) => ({ device, index }))
  const worker = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const messages: string[] = []
      let page: Page | undefined
      try {
        const opened = await openPage(browser, job.device, url, opts, messages)
        page = opened.page
        out[job.index] = { device: job.device, status: opened.status, messages, value: await fn(page, job.device) }
      } catch (err) {
        out[job.index] = { device: job.device, status: 0, messages, error: (err as Error).message.split('\n')[0] }
      } finally {
        await page?.context().close().catch(() => {})
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, devices.length) }, worker))
  return out
}

/* ---------- responsive check ---------- */

export interface DeviceReport {
  device: DeviceSummary
  /** HTTP status of the page, when it was loaded over HTTP. */
  status?: number
  issues: Issue[]
  /** Console errors, uncaught exceptions and failed requests seen on this device. */
  console: string[]
  error?: string
}

export interface CheckReport {
  url: string
  checkedAt: string
  summary: { devices: number; errors: number; warnings: number; info: number; devicesWithErrors: string[] }
  devices: DeviceReport[]
}

export async function checkResponsive(browser: Browser, url: string, devices: Device[], opts: LoadOptions = {}): Promise<CheckReport> {
  const runs = await eachDevice(browser, devices, url, opts, (page, device) =>
    page.evaluate(auditPage, { touch: device.touch, ios: device.os === 'ios' || device.os === 'ipados', mobile: device.mobile, dpr: device.dpr })
  )
  const reports: DeviceReport[] = runs.map((r) => ({
    device: summarize(r.device),
    ...(r.status ? { status: r.status } : {}),
    issues: r.value ?? [],
    console: r.messages,
    ...(r.error ? { error: r.error } : {})
  }))
  const count = (severity: Issue['severity']): number => reports.reduce((n, r) => n + r.issues.filter((i) => i.severity === severity).length, 0)
  return {
    url,
    checkedAt: new Date().toISOString(),
    summary: {
      devices: reports.length,
      errors: count('error'),
      warnings: count('warn'),
      info: count('info'),
      devicesWithErrors: reports.filter((r) => r.error || r.issues.some((i) => i.severity === 'error')).map((r) => r.device.name)
    },
    devices: reports
  }
}

/* ---------- screenshots ---------- */

export interface Shot {
  device: DeviceSummary
  image?: Buffer
  /** Set when a full-page capture was cut short to keep the image a usable size. */
  truncated?: boolean
  error?: string
}

const MAX_FULL_HEIGHT = 6000

export async function screenshots(
  browser: Browser,
  url: string,
  devices: Device[],
  opts: LoadOptions & { fullPage?: boolean; format?: 'png' | 'jpeg'; cssScale?: boolean } = {}
): Promise<Shot[]> {
  const runs = await eachDevice(browser, devices, url, opts, async (page, device) => {
    const height = opts.fullPage ? await page.evaluate(() => document.documentElement.scrollHeight) : device.height
    const truncated = !!opts.fullPage && height > MAX_FULL_HEIGHT
    const image = await page.screenshot({
      type: opts.format ?? 'png',
      ...(opts.format === 'jpeg' ? { quality: 72 } : {}),
      fullPage: !!opts.fullPage,
      ...(truncated ? { clip: { x: 0, y: 0, width: device.width, height: MAX_FULL_HEIGHT } } : {}),
      scale: opts.cssScale ? 'css' : 'device'
    })
    return { image, truncated }
  })
  return runs.map((r) => ({ device: summarize(r.device), image: r.value?.image, ...(r.value?.truncated ? { truncated: true } : {}), ...(r.error ? { error: r.error } : {}) }))
}

/* ---------- accessibility ---------- */

let axeSource: string | undefined
const loadAxe = (): string => (axeSource ??= readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8'))

export interface A11yReport {
  url: string
  device: DeviceSummary
  violations: A11yViolation[]
  passes: number
  incomplete: number
}

export async function auditAccessibility(browser: Browser, url: string, device: Device, opts: LoadOptions = {}): Promise<A11yReport> {
  const [run] = await eachDevice(browser, [device], url, opts, async (page) => {
    // Evaluated over the DevTools protocol, so a strict content security policy does not block it.
    await page.evaluate(`${loadAxe()};void 0`)
    return page.evaluate(runAxe)
  })
  if (run.error || !run.value) throw new Error(run.error ?? 'The accessibility audit did not run')
  return { url, device: summarize(device), ...run.value }
}

/* ---------- one element across devices ---------- */

export async function compareElement(browser: Browser, url: string, selector: string, devices: Device[], opts: LoadOptions = {}): Promise<Array<{ device: DeviceSummary; element?: ElementReport; error?: string }>> {
  const runs = await eachDevice(browser, devices, url, opts, (page) => page.evaluate(measureElement, selector))
  return runs.map((r) => ({ device: summarize(r.device), ...(r.value ? { element: r.value } : {}), ...(r.error ? { error: r.error } : {}) }))
}
