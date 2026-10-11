import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

export type ToolContent = Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
export type ToolRunner = (tool: string, args: Record<string, unknown>) => Promise<ToolContent>

const device = z
  .string()
  .optional()
  .describe('Device name or pane id from get_state. Omit to use the primary (first) device.')

const TOOLS: Record<string, { description: string; schema: z.ZodRawShape }> = {
  get_state: {
    description:
      'Describe the Facet workspace: the loaded URL, page title, and every open device pane with its viewport size, pixel ratio and emulation. Call this first.',
    schema: {}
  },
  navigate: {
    description:
      'Load a URL in every device pane at once and wait for the pages to finish loading. Bare hosts get a scheme (http for localhost, https otherwise).',
    schema: { url: z.string().min(1).describe('URL to open in all panes') }
  },
  list_devices: {
    description: 'List every device preset available in Facet (phones, tablets, laptops, desktops) with viewport size and pixel ratio.',
    schema: {}
  },
  set_devices: {
    description:
      'Replace the open device panes. Accepts device ids or names from list_devices, or a free-form size such as "1024x768".',
    schema: { devices: z.array(z.string()).min(1).describe('e.g. ["iPhone 17", "iPad", "1440x900"]') }
  },
  screenshot: {
    description:
      'Capture screenshots to review a page across viewports. Returns one labelled JPEG per device, or a single device when `device` is given. Set fullPage to capture the whole scrollable page.',
    schema: { device, fullPage: z.boolean().optional().describe('Capture the entire page, not only the visible viewport') }
  },
  audit_responsive: {
    description:
      'Run the responsive linter in every device pane and return the problems found per device: horizontal overflow and the elements causing it, tap targets that are too small, unreadably small text, inputs that trigger iOS zoom, viewport meta problems, oversized images and clipped text. Use after changing layout or CSS.',
    schema: {}
  },
  audit_accessibility: {
    description:
      'Run an axe-core accessibility audit in a device pane and return WCAG violations with impact, affected selectors and how to fix them.',
    schema: { device }
  },
  get_meta: {
    description:
      'Return the page SEO and social metadata (title, description, canonical, Open Graph, Twitter card, icons, structured data) with validation warnings.',
    schema: {}
  },
  get_console: {
    description:
      'Return console errors, warnings and failed network requests collected from the device panes, labelled by device. Useful for bugs that only occur at one viewport.',
    schema: { level: z.enum(['all', 'error', 'warn']).optional().describe('Filter by level; defaults to errors and warnings') }
  },
  get_breakpoints: {
    description: 'List the min-width / max-width media query breakpoints declared in the page stylesheets.',
    schema: {}
  },
  compare_element: {
    description:
      'Measure one element in every device pane: bounding box, visibility, font size, display and other computed styles. Shows how a component responds across viewports.',
    schema: { selector: z.string().min(1).describe('CSS selector of the element') }
  },
  read_page: {
    description:
      'Read the visible text and the interactive elements (links, buttons, form fields) of a device pane, with CSS selectors usable by click and type_text.',
    schema: { device }
  },
  click: {
    description: 'Click an element in a device pane. With interaction mirroring on (the default) the click is replayed in every other pane.',
    schema: { selector: z.string().min(1).describe('CSS selector of the element to click'), device }
  },
  type_text: {
    description: 'Type into a form field in a device pane; mirrored to the other panes. Optionally clear it first or press Enter afterwards.',
    schema: {
      selector: z.string().min(1).describe('CSS selector of the input, textarea or select'),
      text: z.string(),
      pressEnter: z.boolean().optional().describe('Submit the surrounding form after typing'),
      device
    }
  },
  scroll: {
    description: 'Scroll every pane to the same relative position, or bring an element into view.',
    schema: {
      position: z.number().min(0).max(1).optional().describe('0 = top, 1 = bottom'),
      selector: z.string().optional().describe('Scroll this element into view instead')
    }
  },
  set_emulation: {
    description:
      'Change emulation for all panes: colour scheme, reduced motion, contrast, vision deficiency, network throttling, CPU throttling, print media.',
    schema: {
      colorScheme: z.enum(['system', 'light', 'dark']).optional(),
      reducedMotion: z.boolean().optional(),
      contrast: z.enum(['no-preference', 'more', 'less']).optional(),
      forcedColors: z.boolean().optional(),
      vision: z.enum(['none', 'blurredVision', 'reducedContrast', 'achromatopsia', 'deuteranopia', 'protanopia', 'tritanopia']).optional(),
      network: z.enum(['online', 'fast4g', 'slow4g', '3g', 'offline']).optional(),
      cpu: z.number().min(1).max(20).optional().describe('CPU slowdown multiplier'),
      media: z.enum(['screen', 'print']).optional()
    }
  }
}

export const TOOL_NAMES = Object.keys(TOOLS)

function buildServer(run: ToolRunner, version: string): McpServer {
  const server = new McpServer({ name: 'facet', version })
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, { description: def.description, inputSchema: def.schema }, async (args: Record<string, unknown>) => {
      try {
        return { content: await run(name, args ?? {}) }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
      }
    })
  }
  return server
}

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

/** Rejects cross-site and DNS-rebinding requests; only local clients may call. */
function isLocalRequest(req: IncomingMessage): boolean {
  if (!LOCAL.test(req.headers.host ?? '')) return false
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return LOCAL.test(new URL(origin).host)
  } catch {
    return false
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 4_000_000) {
        reject(new Error('Request too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

const rpcError = (res: ServerResponse, status: number, message: string): void => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

export interface McpStatus {
  running: boolean
  port: number
  url: string
  error?: string
}

let httpServer: Server | null = null
let status: McpStatus = { running: false, port: 0, url: '' }

export function mcpStatus(): McpStatus {
  return status
}

export async function stopMcp(): Promise<McpStatus> {
  const server = httpServer
  httpServer = null
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  status = { running: false, port: status.port, url: '' }
  return status
}

export async function startMcp(port: number, run: ToolRunner, version: string): Promise<McpStatus> {
  await stopMcp()
  const server = createServer(async (req, res) => {
    if (!isLocalRequest(req)) return rpcError(res, 403, 'Forbidden')
    if (!req.url?.startsWith('/mcp')) return rpcError(res, 404, 'Not found')
    // Stateless transport: no SSE stream to resume and no session to delete.
    if (req.method !== 'POST') return rpcError(res, 405, 'Method not allowed')
    try {
      const body = await readBody(req)
      const mcp = buildServer(run, version)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      if (!res.headersSent) rpcError(res, 500, (err as Error).message)
    }
  })

  return new Promise((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      status = {
        running: false,
        port,
        url: '',
        error: err.code === 'EADDRINUSE' ? `Port ${port} is already in use` : err.message
      }
      resolve(status)
    })
    server.listen(port, '127.0.0.1', () => {
      httpServer = server
      status = { running: true, port, url: `http://127.0.0.1:${port}/mcp` }
      resolve(status)
    })
  })
}
