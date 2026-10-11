import { bridge } from '@/lib/bridge'
import { getView, viewIdOf } from '@/lib/views'
import { toast, useRuntime } from '@/store/runtime'

export interface DiffResult {
  /** Share of pixels that differ, 0 to 100. */
  percent: number
  /** Side A in muted greyscale with every differing pixel painted magenta. */
  dataUrl: string
}

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode capture'))
    img.src = src
  })

/** Per-channel difference above which two pixels count as different; absorbs antialiasing noise. */
const THRESHOLD = 40

export async function diffImages(a: string, b: string): Promise<DiffResult> {
  const [imgA, imgB] = await Promise.all([load(a), load(b)])
  const width = Math.min(imgA.width, imgB.width)
  const height = Math.min(imgA.height, imgB.height)
  const pixels = (img: HTMLImageElement): { ctx: CanvasRenderingContext2D; data: ImageData } => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0)
    return { ctx, data: ctx.getImageData(0, 0, width, height) }
  }
  const left = pixels(imgA)
  const right = pixels(imgB).data.data
  const out = left.data.data
  let different = 0
  for (let i = 0; i < out.length; i += 4) {
    const delta = Math.abs(out[i] - right[i]) + Math.abs(out[i + 1] - right[i + 1]) + Math.abs(out[i + 2] - right[i + 2])
    if (delta > THRESHOLD) {
      different++
      out[i] = 255
      out[i + 1] = 0
      out[i + 2] = 170
    } else {
      // Wash unchanged pixels towards white so the differences stand out.
      const grey = (out[i] * 0.3 + out[i + 1] * 0.59 + out[i + 2] * 0.11) * 0.35 + 166
      out[i] = out[i + 1] = out[i + 2] = grey
    }
    out[i + 3] = 255
  }
  left.ctx.putImageData(left.data, 0, 0)
  return { percent: (different / (width * height)) * 100, dataUrl: left.ctx.canvas.toDataURL('image/png') }
}

/** Captures both sides of a comparison pane and stores their pixel diff. */
export async function diffPane(paneId: string): Promise<DiffResult | null> {
  const [a, b] = [viewIdOf(paneId, 'a'), viewIdOf(paneId, 'b')]
  if (!getView(a) || !getView(b)) return null
  try {
    const [shotA, shotB] = await Promise.all([bridge.capture(a, false), bridge.capture(b, false)])
    const result = await diffImages(shotA.dataUrl, shotB.dataUrl)
    useRuntime.getState().setDiff(paneId, result)
    return result
  } catch (err) {
    toast(`Could not compare: ${(err as Error).message}`, 'error')
    return null
  }
}
