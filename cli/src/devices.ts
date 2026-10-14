import { BUILTIN_DEVICES, BUILTIN_SUITES, KIND_LABELS, RESPONSIVE_ID } from '@shared/devices'
import type { Device } from '@shared/types'

/** The devices checked when none are named: the most common real-world sizes. */
export const DEFAULT_SUITE = 'popular'
/** Fewer devices for screenshots, so the images stay readable to an agent. */
export const SCREENSHOT_SUITE = 'default'

const responsive = BUILTIN_DEVICES.find((d) => d.id === RESPONSIVE_ID)!
const catalogue = BUILTIN_DEVICES.filter((d) => d.id !== RESPONSIVE_ID)
const loose = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Resolves one token: a suite id or name ("popular", "phones"), a device id
 * ("iphone-17"), a device name ("Galaxy S26"), or a free-form "WIDTHxHEIGHT".
 */
function resolveToken(token: string): Device[] {
  const raw = token.trim()
  const size = /^(\d{2,4})\s*[x×]\s*(\d{2,4})$/i.exec(raw)
  if (size) {
    const [width, height] = [Number(size[1]), Number(size[2])]
    return [{ ...responsive, id: `${width}x${height}`, name: `${width} × ${height}`, width, height }]
  }
  const needle = raw.toLowerCase()
  const suite = BUILTIN_SUITES.find((s) => s.id === needle || s.name.toLowerCase() === needle)
  if (suite) return suite.deviceIds.map((id) => catalogue.find((d) => d.id === id)).filter((d): d is Device => !!d)
  const match =
    catalogue.find((d) => d.id === needle) ??
    catalogue.find((d) => d.name.toLowerCase() === needle) ??
    catalogue.find((d) => loose(d.name) === loose(raw)) ??
    catalogue.find((d) => loose(d.name).includes(loose(raw)))
  if (!match) {
    const near = catalogue.filter((d) => loose(d.name).includes(loose(raw).slice(0, 4))).slice(0, 5)
    throw new Error(`Unknown device "${raw}".` + (near.length ? ` Did you mean: ${near.map((d) => d.id).join(', ')}?` : ' Run `facet-check --list-devices` for the catalogue.'))
  }
  return [match]
}

/** Resolves device tokens (comma-separated or as separate items), dropping duplicates. */
export function resolveDevices(tokens: string[] | undefined, fallbackSuite = DEFAULT_SUITE): Device[] {
  const list = (tokens ?? []).flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean)
  const devices = (list.length ? list : [fallbackSuite]).flatMap(resolveToken)
  const seen = new Set<string>()
  return devices.filter((d) => !seen.has(d.id) && seen.add(d.id))
}

export interface DeviceSummary {
  id: string
  name: string
  kind: string
  width: number
  height: number
  pixelRatio: number
  touch: boolean
}

export const summarize = (d: Device): DeviceSummary => ({ id: d.id, name: d.name, kind: d.kind, width: d.width, height: d.height, pixelRatio: d.dpr, touch: d.touch })

export function listDevices(query?: string, kind?: string): DeviceSummary[] {
  const q = query ? loose(query) : ''
  return catalogue
    .filter((d) => (!kind || d.kind === kind) && (!q || loose(d.name).includes(q) || d.id.includes(query!.toLowerCase())))
    .map(summarize)
}

export const SUITES = BUILTIN_SUITES.map((s) => ({ id: s.id, name: s.name, devices: s.deviceIds }))
export const KINDS = Object.keys(KIND_LABELS).filter((k) => k !== 'responsive')
