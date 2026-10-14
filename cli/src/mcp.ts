import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Browser } from 'playwright-core'
import { z } from 'zod'
import { auditAccessibility, checkResponsive, compareElement, launchBrowser, screenshots, toUrl } from './browser'
import { KINDS, listDevices, resolveDevices, SCREENSHOT_SUITE, SUITES } from './devices'

declare const __VERSION__: string

type Content = Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>

const text = (value: unknown): Content => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]

const url = z.string().min(1).describe('Page to load: a full URL, a bare host such as example.com, localhost:3000 for a local dev server, or a path to an HTML file')
const devices = z
  .array(z.string())
  .optional()
  .describe(
    'Device ids or names from list_devices ("iphone-17", "Galaxy S26"), free-form sizes ("1024x768"), or a preset: ' +
      SUITES.map((s) => s.id).join(', ') +
      '.'
  )

let browser: Promise<Browser> | undefined
const getBrowser = (): Promise<Browser> => {
  browser ??= launchBrowser().catch((err) => {
    browser = undefined
    throw err
  })
  return browser
}

const TOOLS: Record<string, { description: string; schema: z.ZodRawShape; run: (args: Record<string, unknown>) => Promise<Content> }> = {
  check_responsive: {
    description:
      'Check a web page for responsive design problems on real phone, tablet, laptop and desktop viewports (with each device\'s pixel ratio, touch support and user agent). ' +
      'Returns the problems found on each device: horizontal scrolling and the elements causing it, tap targets under 24px, text under 12px, form fields that make iOS zoom, ' +
      'viewport meta mistakes, clipped text, oversized or blurry images, fixed headers covering the screen, plus console errors per device. ' +
      'Defaults to the six most common screen sizes. Works with localhost. Use it after changing layout or CSS, or when asked whether a site is mobile friendly.',
    schema: { url, devices },
    run: async (args) => {
      const report = await checkResponsive(await getBrowser(), toUrl(String(args.url)), resolveDevices(args.devices as string[] | undefined))
      return text(report)
    }
  },
  screenshot: {
    description:
      'Screenshot a web page on several devices at once to see how its layout responds. Returns one labelled image per device. ' +
      'Defaults to a phone, a tablet and a laptop. Set fullPage to capture the whole page (cut off at 6000px).',
    schema: { url, devices, fullPage: z.boolean().optional().describe('Capture the whole scrollable page, not only the first screen') },
    run: async (args) => {
      const list = resolveDevices(args.devices as string[] | undefined, SCREENSHOT_SUITE)
      if (list.length > 8) throw new Error(`Asked for ${list.length} devices; screenshot at most 8 at a time.`)
      const shots = await screenshots(await getBrowser(), toUrl(String(args.url)), list, { fullPage: !!args.fullPage, format: 'jpeg', cssScale: true })
      return shots.flatMap((s): Content => {
        const label = `${s.device.name} (${s.device.width}×${s.device.height}, ${s.device.pixelRatio}x)`
        if (!s.image) return text(`${label}: ${s.error ?? 'no image'}`)
        return [
          { type: 'text', text: label + (s.truncated ? ', cut off at 6000px' : '') },
          { type: 'image', data: s.image.toString('base64'), mimeType: 'image/jpeg' }
        ]
      })
    }
  },
  audit_accessibility: {
    description:
      'Run an axe-core accessibility audit of a web page on one device and return the WCAG violations with their impact, the affected elements and how to fix them.',
    schema: { url, device: z.string().optional().describe('Device id, name or size; defaults to an iPhone') },
    run: async (args) => {
      const [device] = resolveDevices(args.device ? [String(args.device)] : ['iphone-17'])
      return text(await auditAccessibility(await getBrowser(), toUrl(String(args.url)), device))
    }
  },
  compare_element: {
    description:
      'Measure one element of a page on every device: size, position, visibility, font size, display, flex and grid settings. Shows how a component changes across breakpoints.',
    schema: { url, selector: z.string().min(1).describe('CSS selector of the element'), devices },
    run: async (args) => text(await compareElement(await getBrowser(), toUrl(String(args.url)), String(args.selector), resolveDevices(args.devices as string[] | undefined)))
  },
  list_devices: {
    description: 'List the 290+ device profiles (phones, foldables, tablets, laptops, desktops, watches, TVs) with viewport size and pixel ratio, and the named presets.',
    schema: {
      query: z.string().optional().describe('Filter by name, e.g. "iphone" or "galaxy"'),
      kind: z.enum(KINDS as [string, ...string[]]).optional()
    },
    run: async (args) => {
      const list = listDevices(args.query as string | undefined, args.kind as string | undefined)
      return text({ presets: SUITES, count: list.length, devices: list })
    }
  }
}

export async function serveMcp(): Promise<void> {
  const server = new McpServer({ name: 'facet', version: __VERSION__ })
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, { description: def.description, inputSchema: def.schema }, async (args: Record<string, unknown>) => {
      try {
        return { content: await def.run(args ?? {}) }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
      }
    })
  }
  const close = async (): Promise<void> => {
    const open = browser
    browser = undefined
    await (await open?.catch(() => undefined))?.close().catch(() => {})
    process.exit(0)
  }
  process.stdin.on('close', close)
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  await server.connect(new StdioServerTransport())
}
