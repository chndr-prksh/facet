import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ClipboardItem, clipboard, nativeImage, screen } from 'electron'
import type { CaptureResult } from '@shared/types'
import { cdp, getPane } from './panes'

/*
 * Two Chromium behaviours shape this file. Both were found by capturing a
 * page of solid colour blocks and reading the pixels back:
 *
 * 1. A guest's surface is allocated at the host display's pixel ratio. Asking
 *    for more pixels than it holds (a 3x phone on a 2x display) returns the
 *    surface tiled, so captures are taken at the lower of the two ratios.
 * 2. captureBeyondViewport does not render beyond the viewport in a guest; it
 *    repeats the visible part. Full pages are therefore scrolled and stitched.
 */

/** Tallest stitched image, in pixels. Beyond this the capture is cut short. */
const MAX_HEIGHT = 30000

interface Box {
  pageX: number
  pageY: number
  clientWidth: number
  clientHeight: number
  scale?: number
}

type Pane = NonNullable<ReturnType<typeof getPane>>

function hostScaleFactor(): number {
  const win = BrowserWindow.getAllWindows()[0]
  return (win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).scaleFactor
}

const visualViewport = async (paneId: string): Promise<Box> => (await cdp<{ cssVisualViewport: Box }>(paneId, 'Page.getLayoutMetrics')).cssVisualViewport

/** Captures exactly what the pane is showing. Returns the PNG and its pixels per CSS pixel. */
async function captureVisible(pane: Pane, visual: Box): Promise<{ png: Buffer; pxPerCss: number }> {
  const emulated = pane.spec?.dpr ?? 1
  const deviceWidth = pane.spec?.width ?? visual.clientWidth
  const ratio = Math.min(emulated, hostScaleFactor())
  // Page zoom: under 1 when a phone has zoomed out to fit an overflowing page.
  const zoom = deviceWidth / visual.clientWidth
  const plain = ratio === emulated && Math.abs(zoom - 1) < 0.01
  const { data } = await cdp<{ data: string }>(
    pane.paneId,
    'Page.captureScreenshot',
    plain
      ? { format: 'png' }
      : { format: 'png', clip: { x: visual.pageX, y: visual.pageY, width: visual.clientWidth, height: visual.clientHeight, scale: (ratio / emulated) * zoom } }
  )
  return { png: Buffer.from(data, 'base64'), pxPerCss: ratio * zoom }
}

/*
 * Fixed and sticky elements would repeat in every slice. Sticky ones are put
 * back in normal flow for the duration; fixed ones are tagged by the edge they
 * hug, so headers show only in the first slice and footers only in the last.
 */
const PREPARE = `(() => {
  const touched = []
  const vh = window.visualViewport ? visualViewport.height : innerHeight
  for (const el of document.querySelectorAll('body *')) {
    const position = getComputedStyle(el).position
    if (position !== 'fixed' && position !== 'sticky') continue
    touched.push([el, el.getAttribute('style')])
    if (position === 'sticky') {
      el.style.setProperty('position', 'relative', 'important')
      el.style.setProperty('top', 'auto', 'important')
      el.style.setProperty('bottom', 'auto', 'important')
    } else {
      const r = el.getBoundingClientRect()
      el.setAttribute('data-facet-fixed', r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom')
    }
  }
  window.__facetCapture = { touched, x: scrollX, y: scrollY, behavior: document.documentElement.style.scrollBehavior }
  document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important')
  return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)
})()`

const showFixed = (edge: 'top' | 'bottom' | 'none'): string => `(() => {
  for (const el of document.querySelectorAll('[data-facet-fixed]')) {
    el.style.setProperty('visibility', el.getAttribute('data-facet-fixed') === ${JSON.stringify(edge)} ? 'visible' : 'hidden', 'important')
  }
})()`

const scrollTo = (y: number): string => `new Promise((resolve) => {
  window.scrollTo(0, ${y})
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 90)))
})`

const RESTORE = `(() => {
  const state = window.__facetCapture
  if (!state) return
  for (const [el, style] of state.touched) {
    el.removeAttribute('data-facet-fixed')
    if (style === null) el.removeAttribute('style')
    else el.setAttribute('style', style)
  }
  document.documentElement.style.scrollBehavior = state.behavior
  window.scrollTo(state.x, state.y)
  delete window.__facetCapture
})()`

async function captureFullPage(pane: Pane): Promise<CaptureResult> {
  const { wc, paneId } = pane
  const run = <T>(code: string): Promise<T> => wc.executeJavaScript(code, false) as Promise<T>
  const before = await visualViewport(paneId)
  // A phone showing part of an overflowing or zoomed page: zoom out so the
  // visible area and the layout viewport coincide, which is how the phone
  // itself would present the whole page.
  const partial = !!pane.spec?.mobile && (await run<boolean>('innerWidth > visualViewport.width + 1').catch(() => false))
  if (partial) await cdp(paneId, 'Emulation.setPageScaleFactor', { pageScaleFactor: 0.01 }).catch(() => {})

  const slices: Array<{ png: Buffer; top: number; height: number }> = []
  let pxPerCss = 1
  let total = 0
  try {
    total = await run<number>(PREPARE)
    for (let y = 0, i = 0; i < 80; i++) {
      await run(scrollTo(y))
      const visual = await visualViewport(paneId)
      // The page may have grown as lazy content loaded on the way down.
      total = Math.max(total, await run<number>('document.documentElement.scrollHeight'))
      const last = visual.pageY + visual.clientHeight >= total - 1
      await run(showFixed(i === 0 ? 'top' : last ? 'bottom' : 'none'))
      const shot = await captureVisible(pane, visual)
      pxPerCss = shot.pxPerCss
      slices.push({ png: shot.png, top: visual.pageY, height: visual.clientHeight })
      if (last || (visual.pageY + visual.clientHeight) * pxPerCss > MAX_HEIGHT) break
      y = visual.pageY + visual.clientHeight
    }
  } finally {
    await run(RESTORE).catch(() => {})
    if (partial) await cdp(paneId, 'Emulation.setPageScaleFactor', { pageScaleFactor: before.scale ?? 1 }).catch(() => {})
  }
  if (!slices.length) throw new Error('Nothing to capture')

  // Stitch raw bitmaps. Slices are placed by where the page really scrolled
  // to, so the final, overlapping slice simply overwrites the rows it shares.
  const firstSize = nativeImage.createFromBuffer(slices[0].png).getSize()
  const width = firstSize.width
  const rowsPerCss = firstSize.height / slices[0].height
  const fullHeight = Math.round(total * rowsPerCss)
  const height = Math.min(fullHeight, MAX_HEIGHT)
  const canvas = Buffer.alloc(width * height * 4, 255)
  for (const slice of slices) {
    const image = nativeImage.createFromBuffer(slice.png)
    const size = image.getSize()
    if (size.width !== width) continue
    const offset = Math.round(slice.top * rowsPerCss)
    const rows = Math.min(size.height, height - offset)
    if (rows > 0) image.toBitmap().copy(canvas, offset * width * 4, 0, rows * width * 4)
  }
  const png = nativeImage.createFromBitmap(canvas, { width, height }).toPNG()
  return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width, height, scale: pxPerCss, truncated: fullHeight > MAX_HEIGHT }
}

export async function capturePane(paneId: string, fullPage: boolean): Promise<CaptureResult> {
  const pane = getPane(paneId)
  if (!pane) throw new Error(`Unknown pane ${paneId}`)
  if (fullPage) return captureFullPage(pane)
  const { png, pxPerCss } = await captureVisible(pane, await visualViewport(paneId))
  const size = nativeImage.createFromBuffer(png).getSize()
  return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, ...size, scale: pxPerCss }
}

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled'

const stamp = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

export function defaultScreenshotDir(): string {
  return join(homedir(), 'Pictures', 'Facet')
}

/**
 * Writes images under `<dir>/<site>/`. A single image is saved flat; a batch
 * gets its own timestamped folder so one run stays together.
 */
export async function saveImages(
  items: Array<{ name: string; dataUrl: string }>,
  site: string,
  dir: string
): Promise<string[]> {
  const root = join(dir || defaultScreenshotDir(), safeName(site || 'screenshots'))
  const when = stamp()
  const folder = items.length > 1 ? join(root, when) : root
  await mkdir(folder, { recursive: true })
  const paths: string[] = []
  for (const item of items) {
    const file = join(folder, items.length > 1 ? `${safeName(item.name)}.png` : `${safeName(item.name)} ${when}.png`)
    await writeFile(file, Buffer.from(item.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
    paths.push(file)
  }
  return paths
}

export async function copyImage(dataUrl: string): Promise<void> {
  const png = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
}
