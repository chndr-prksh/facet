const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w-]+\.(localhost|local|test))(:\d+)?(\/|$|\?|#)/i

/**
 * Turns address-bar input into a loadable URL. Bare hosts get a scheme
 * (http for local hosts, https otherwise); anything else becomes a search.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return ''
  if (/^(https?|file|about|data|blob|view-source):/i.test(raw)) return raw
  if (raw.startsWith('/') || /^~\//.test(raw)) return `file://${raw}`
  if (LOCAL_HOST.test(raw) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(raw) || /^:\d{2,5}/.test(raw)) {
    return `http://${raw.startsWith(':') ? 'localhost' + raw : raw}`
  }
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(raw)) return `https://${raw}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' ? 'local-file' : u.host
  } catch {
    return ''
  }
}

/** True when two URLs point at the same document, ignoring trailing slash. */
export function sameUrl(a: string, b: string): boolean {
  const strip = (u: string): string => u.replace(/\/(?=$|[?#])/, '').replace(/#$/, '')
  return strip(a) === strip(b)
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
