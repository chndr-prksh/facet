import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, extname, join } from 'node:path'
import { app, net, session } from 'electron'
import type { CookieInfo, DevServer, LinkCheck } from '@shared/types'

/* ---------- persisted state ---------- */

const stateFile = (): string => join(app.getPath('userData'), 'state.json')

export async function loadState(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(stateFile(), 'utf8'))
  } catch {
    return null
  }
}

let writing: Promise<void> = Promise.resolve()

export function saveState(state: unknown): Promise<void> {
  // Serialised, and written via a temp file so a crash never leaves a
  // half-written state.json behind.
  writing = writing.then(async () => {
    const file = stateFile()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(`${file}.tmp`, JSON.stringify(state))
    await rename(`${file}.tmp`, file)
  }).catch(() => {})
  return writing
}

/* ---------- cookies & storage ---------- */

export async function listCookies(partition: string, url: string): Promise<CookieInfo[]> {
  const cookies = await session.fromPartition(partition).cookies.get({ url })
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite ?? 'unspecified',
    expires: c.expirationDate
  }))
}

export async function removeCookie(partition: string, url: string, name: string): Promise<void> {
  await session.fromPartition(partition).cookies.remove(url, name)
}

type StorageKind = 'cookies' | 'storage' | 'cache'

export async function clearData(partition: string, kinds: StorageKind[], origin?: string): Promise<void> {
  const ses = session.fromPartition(partition)
  const storages: Array<'cookies' | 'localstorage' | 'indexdb' | 'serviceworkers' | 'cachestorage'> = []
  if (kinds.includes('cookies')) storages.push('cookies')
  if (kinds.includes('storage')) storages.push('localstorage', 'indexdb', 'serviceworkers', 'cachestorage')
  if (storages.length) await ses.clearStorageData({ origin, storages })
  if (kinds.includes('cache')) await ses.clearCache()
}

/* ---------- link checker ---------- */

async function probe(url: string): Promise<LinkCheck> {
  const attempt = async (method: 'HEAD' | 'GET'): Promise<number> => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 9000)
    try {
      const res = await net.fetch(url, { method, redirect: 'follow', signal: ctl.signal })
      return res.status
    } finally {
      clearTimeout(timer)
    }
  }
  try {
    let status = await attempt('HEAD')
    // Plenty of servers reject HEAD outright; a GET tells the truth.
    if (status === 405 || status === 403 || status === 501 || status === 400) status = await attempt('GET')
    return { url, status, ok: status < 400 }
  } catch (err) {
    return { url, status: 0, ok: false, error: (err as Error).message }
  }
}

export async function checkLinks(urls: string[]): Promise<LinkCheck[]> {
  const queue = [...new Set(urls)].filter((u) => /^https?:/i.test(u)).slice(0, 300)
  const results: LinkCheck[] = []
  const worker = async (): Promise<void> => {
    for (let url = queue.shift(); url; url = queue.shift()) results.push(await probe(url))
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return results
}

/* ---------- local dev server discovery ---------- */

const DEV_PORTS = [3000, 3001, 3002, 3333, 4000, 4173, 4200, 4321, 5000, 5173, 5174, 5500, 6006, 8000, 8080, 8081, 8888, 9000, 1234, 1313]

const isOpen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host: 'localhost', port, timeout: 350 })
    const done = (open: boolean): void => {
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

export async function scanDevServers(): Promise<DevServer[]> {
  const open = (await Promise.all(DEV_PORTS.map(async (port) => ((await isOpen(port)) ? port : 0)))).filter(Boolean)
  const servers = await Promise.all(
    open.map(async (port): Promise<DevServer | null> => {
      const url = `http://localhost:${port}`
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 1500)
      try {
        const res = await fetch(url, { signal: ctl.signal })
        // macOS AirPlay Receiver squats on 5000 and 7000.
        if (/airtunes/i.test(res.headers.get('server') ?? '')) return null
        if (!/html/i.test(res.headers.get('content-type') ?? '')) return null
        const title = /<title[^>]*>([^<]*)<\/title>/i.exec(await res.text())?.[1]?.trim()
        return { port, url, title: title || undefined }
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    })
  )
  return servers.filter((s): s is DevServer => s !== null).sort((a, b) => a.port - b.port)
}

/* ---------- live reload ---------- */

const watchers = new Map<string, FSWatcher>()
const IGNORED = /(^|[\\/])(node_modules|\.git|\.next|\.cache|dist|out)([\\/]|$)|~$|\.swp$|\.DS_Store$/

export function watchDir(key: string, dir: string, onChange: (kind: 'css' | 'full', file: string) => void): boolean {
  unwatchDir(key)
  let timer: NodeJS.Timeout | undefined
  let pending: 'css' | 'full' | undefined
  let last = ''
  try {
    const watcher = watch(dir, { recursive: true }, (_event, file) => {
      if (!file || IGNORED.test(file)) return
      const kind = extname(file).toLowerCase() === '.css' ? 'css' : 'full'
      pending = pending === 'full' ? 'full' : kind
      last = file
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (pending) onChange(pending, last)
        pending = undefined
      }, 120)
    })
    watcher.on('error', () => unwatchDir(key))
    watchers.set(key, watcher)
    return true
  } catch {
    return false
  }
}

export function unwatchDir(key: string): void {
  watchers.get(key)?.close()
  watchers.delete(key)
}

export function unwatchAll(): void {
  for (const key of [...watchers.keys()]) unwatchDir(key)
}
