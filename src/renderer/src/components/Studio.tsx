import { Copy, Download } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { hostOf } from '@shared/urls'
import { bridge } from '@/lib/bridge'
import { toast, useRuntime, type Shot } from '@/store/runtime'
import { activeTab, useWorkspace } from '@/store/workspace'
import { Modal, Row, Segmented, Toggle } from './ui'

type Backdrop = 'graphite' | 'aurora' | 'paper' | 'sky' | 'white' | 'none'
type Align = 'top' | 'center' | 'bottom'

const BACKDROPS: Array<{ value: Backdrop; label: string }> = [
  { value: 'graphite', label: 'Graphite' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'sky', label: 'Sky' },
  { value: 'paper', label: 'Paper' },
  { value: 'white', label: 'White' },
  { value: 'none', label: 'None' }
]

function paintBackdrop(ctx: CanvasRenderingContext2D, kind: Backdrop, w: number, h: number): void {
  if (kind === 'none') return
  const linear = (stops: string[]): CanvasGradient => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color))
    return g
  }
  ctx.fillStyle =
    kind === 'graphite' ? linear(['#1c1f25', '#0d0e10']) : kind === 'aurora' ? linear(['#1b2a4a', '#3b1d5e', '#0f3d3e']) : kind === 'sky' ? linear(['#dbeafe', '#f5d0fe']) : kind === 'paper' ? '#f3efe6' : '#ffffff'
  ctx.fillRect(0, 0, w, h)
  if (kind === 'aurora') {
    const glow = ctx.createRadialGradient(w * 0.75, h * 0.2, 0, w * 0.75, h * 0.2, w * 0.6)
    glow.addColorStop(0, 'rgba(198,243,94,.28)')
    glow.addColorStop(1, 'rgba(198,243,94,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

interface Options {
  backdrop: Backdrop
  frames: boolean
  labels: boolean
  align: Align
}

/** Composes every device screenshot into one image, drawn at 2x for sharp output. */
async function compose(canvas: HTMLCanvasElement, shots: Shot[], opts: Options): Promise<void> {
  const images = await Promise.all(shots.map((s) => loadImage(s.dataUrl)))
  const css = shots.map((s) => ({ w: s.width / s.dpr, h: s.height / s.dpr }))
  // Devices keep their true relative sizes; the whole row is scaled to a sensible width.
  const scale = Math.min(1, 2600 / css.reduce((sum, s) => sum + s.w, 0))
  const gap = 56
  const pad = 80
  const labelSpace = opts.labels ? 54 : 0
  const items = shots.map((shot, i) => {
    const handheld = shot.kind === 'phone' || shot.kind === 'tablet' || shot.kind === 'foldable' || shot.kind === 'watch'
    const w = css[i].w * scale
    const h = css[i].h * scale
    const bezel = opts.frames ? (handheld ? Math.max(8, 12 * scale) : 0) : 0
    const bar = opts.frames && !handheld ? Math.max(18, 30 * scale) : 0
    const radius = opts.frames ? (handheld ? (shot.radius || 12) * scale : 10) : 6
    return { shot, image: images[i], w, h, bezel, bar, radius, handheld, outerW: w + bezel * 2, outerH: h + bezel * 2 + bar }
  })
  const tallest = Math.max(...items.map((i) => i.outerH))
  const width = pad * 2 + items.reduce((sum, i) => sum + i.outerW, 0) + gap * (items.length - 1)
  const height = pad * 2 + tallest + labelSpace
  const ratio = 2
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  paintBackdrop(ctx, opts.backdrop, width, height)
  const dark = opts.backdrop === 'graphite' || opts.backdrop === 'aurora'

  let x = pad
  for (const item of items) {
    const y = pad + (opts.align === 'top' ? 0 : opts.align === 'center' ? (tallest - item.outerH) / 2 : tallest - item.outerH)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.35)'
    ctx.shadowBlur = 40
    ctx.shadowOffsetY = 18
    ctx.fillStyle = item.handheld && opts.frames ? '#0b0b0d' : '#ffffff'
    ctx.beginPath()
    ctx.roundRect(x, y, item.outerW, item.outerH, item.radius + item.bezel)
    ctx.fill()
    ctx.restore()

    if (item.bar) {
      ctx.fillStyle = '#e9eaee'
      ctx.beginPath()
      ctx.roundRect(x, y, item.outerW, item.bar + item.radius, [item.radius, item.radius, 0, 0])
      ctx.fill()
      const r = Math.max(3, item.bar * 0.17)
      ;['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x + item.bar * 0.55 + i * r * 3.2, y + item.bar / 2, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x + item.bezel, y + item.bezel + item.bar, item.w, item.h, item.bar ? [0, 0, item.radius, item.radius] : item.radius)
    ctx.clip()
    ctx.drawImage(item.image, x + item.bezel, y + item.bezel + item.bar, item.w, item.h)
    ctx.restore()

    if (opts.labels) {
      ctx.textAlign = 'center'
      ctx.fillStyle = dark ? '#e8eaed' : '#16181c'
      ctx.font = '600 15px -apple-system, "Segoe UI", sans-serif'
      ctx.fillText(item.shot.name, x + item.outerW / 2, pad + tallest + 30, Math.max(item.outerW, 120))
      ctx.fillStyle = dark ? '#8b93a1' : '#6b7280'
      ctx.font = '12px ui-monospace, Menlo, monospace'
      ctx.fillText(`${Math.round(item.shot.width / item.shot.dpr)} × ${Math.round(item.shot.height / item.shot.dpr)}`, x + item.outerW / 2, pad + tallest + 48)
    }
    x += item.outerW + gap
  }
}

export function Studio(): ReactNode {
  const shots = useRuntime((s) => s.shots)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [opts, setOpts] = useState<Options>({ backdrop: 'graphite', frames: true, labels: true, align: 'bottom' })
  const patch = (next: Partial<Options>): void => setOpts({ ...opts, ...next })

  useEffect(() => {
    if (canvas.current && shots.length) void compose(canvas.current, shots, opts)
  }, [shots, opts])

  const save = async (): Promise<void> => {
    if (!canvas.current) return
    const [path] = await bridge.saveShots([{ name: 'All devices', dataUrl: canvas.current.toDataURL('image/png') }], hostOf(activeTab().url), useWorkspace.getState().settings.screenshotDir)
    toast('Composite saved', 'success', { label: 'Show in folder', run: () => void bridge.reveal(path) })
  }
  const copy = async (): Promise<void> => {
    if (!canvas.current) return
    await bridge.copyImage(canvas.current.toDataURL('image/png'))
    toast('Composite copied to clipboard', 'success')
  }

  return (
    <Modal
      title="Screenshot studio"
      onClose={() => useRuntime.getState().set({ modal: null, shots: [] })}
      width={1040}
      footer={
        <>
          <span className="dim grow">{shots.length} devices, drawn at their true relative sizes.</span>
          <button type="button" className="btn" onClick={() => void copy()}>
            <Copy size={13} /> Copy
          </button>
          <button type="button" className="btn primary" onClick={() => void save()}>
            <Download size={13} /> Save PNG
          </button>
        </>
      }
    >
      <div className="studio">
        <div className="studio-canvas">
          <canvas ref={canvas} />
        </div>
        <div className="studio-options">
          <Row label="Backdrop">
            <select className="select" value={opts.backdrop} onChange={(e) => patch({ backdrop: e.target.value as Backdrop })}>
              {BACKDROPS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Align">
            <Segmented size="sm" value={opts.align} onChange={(align) => patch({ align })} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} />
          </Row>
          <Row label="Device frames">
            <Toggle checked={opts.frames} onChange={(frames) => patch({ frames })} />
          </Row>
          <Row label="Labels">
            <Toggle checked={opts.labels} onChange={(labels) => patch({ labels })} />
          </Row>
        </div>
      </div>
    </Modal>
  )
}
