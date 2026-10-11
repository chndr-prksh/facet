import type { PageMeta } from '@/lib/scripts'

export interface MetaCheck {
  level: 'error' | 'warn' | 'ok'
  label: string
  detail: string
}

const len = (label: string, value: string, min: number, max: number, missing: MetaCheck['level'] = 'error'): MetaCheck => {
  if (!value) return { level: missing, label, detail: 'Missing' }
  if (value.length < min) return { level: 'warn', label, detail: `${value.length} characters; aim for ${min}–${max}` }
  if (value.length > max) return { level: 'warn', label, detail: `${value.length} characters; search results truncate after about ${max}` }
  return { level: 'ok', label, detail: `${value.length} characters` }
}

/** Checks page metadata against what search engines and link unfurlers expect. */
export function checkMeta(meta: PageMeta): MetaCheck[] {
  const checks: MetaCheck[] = [len('Title', meta.title, 15, 60), len('Meta description', meta.description, 50, 160, 'warn')]

  if (meta.h1.length === 0) checks.push({ level: 'warn', label: 'H1', detail: 'No <h1> on the page' })
  else if (meta.h1.length > 1) checks.push({ level: 'warn', label: 'H1', detail: `${meta.h1.length} <h1> elements; one is clearer` })
  else checks.push({ level: 'ok', label: 'H1', detail: meta.h1[0] || '(empty)' })

  checks.push(meta.lang ? { level: 'ok', label: 'Language', detail: meta.lang } : { level: 'error', label: 'Language', detail: '<html> has no lang attribute; screen readers guess the pronunciation' })
  checks.push(meta.viewport ? { level: 'ok', label: 'Viewport', detail: meta.viewport } : { level: 'error', label: 'Viewport', detail: 'No viewport meta tag' })

  if (!meta.canonical) checks.push({ level: 'warn', label: 'Canonical', detail: 'No canonical URL' })
  else if (meta.canonical.replace(/\/$/, '') !== meta.url.split(/[?#]/)[0].replace(/\/$/, '')) checks.push({ level: 'warn', label: 'Canonical', detail: `Points elsewhere: ${meta.canonical}` })
  else checks.push({ level: 'ok', label: 'Canonical', detail: meta.canonical })

  if (/noindex/i.test(meta.robots)) checks.push({ level: 'warn', label: 'Robots', detail: `"${meta.robots}" keeps this page out of search results` })

  const image = meta.og.image || meta.twitter.image
  if (!meta.og.title && !meta.og.description && !image) {
    checks.push({ level: 'warn', label: 'Open Graph', detail: 'No og: tags; shared links fall back to a bare URL' })
  } else {
    if (!meta.og.title) checks.push({ level: 'warn', label: 'og:title', detail: 'Missing' })
    if (!meta.og.description) checks.push({ level: 'warn', label: 'og:description', detail: 'Missing' })
    checks.push(image ? { level: 'ok', label: 'Share image', detail: image } : { level: 'warn', label: 'Share image', detail: 'No og:image; link previews will have no picture' })
    if (image && !meta.og['image:alt'] && !meta.twitter['image:alt']) checks.push({ level: 'warn', label: 'Share image alt', detail: 'No og:image:alt for screen-reader users' })
  }
  if (!meta.twitter.card) checks.push({ level: 'warn', label: 'twitter:card', detail: 'Missing; X shows a small summary card' })

  if (meta.icons.length === 0) checks.push({ level: 'warn', label: 'Icon', detail: 'No <link rel="icon">' })
  if (!meta.icons.some((i) => /apple-touch-icon/.test(i.rel))) checks.push({ level: 'warn', label: 'Apple touch icon', detail: 'Missing; iOS home-screen shortcuts get a screenshot instead' })
  for (const item of meta.jsonLd) if (!item.valid) checks.push({ level: 'error', label: 'Structured data', detail: 'A JSON-LD block does not parse' })
  return checks
}
