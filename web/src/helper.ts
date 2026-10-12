import { useStore } from './store'

/*
 * Talks to the optional Facet Helper browser extension. Its content script
 * runs in this page and posts messages on this same window, which a framed
 * site cannot imitate: anything a frame sends arrives with the frame as its
 * source, not this window.
 */

/** Sites confirmed (October 2026) to send headers that forbid embedding. Subdomains are assumed to follow. */
const KNOWN_BLOCKERS = [
  'airbnb.com', 'amazon.com', 'anthropic.com', 'apple.com', 'atlassian.com', 'bbc.com', 'bing.com', 'canva.com', 'chatgpt.com', 'claude.ai',
  'cloudflare.com', 'cnn.com', 'developer.mozilla.org', 'discord.com', 'dropbox.com', 'duckduckgo.com', 'ebay.com', 'facebook.com', 'figma.com',
  'github.com', 'gitlab.com', 'google.com', 'hubspot.com', 'instagram.com', 'linkedin.com', 'medium.com', 'mit.edu', 'netflix.com', 'nextjs.org',
  'notion.so', 'npmjs.com', 'nytimes.com', 'openai.com', 'paypal.com', 'pinterest.com', 'producthunt.com', 'reddit.com', 'salesforce.com',
  'slack.com', 'spotify.com', 'stackoverflow.com', 'stripe.com', 'telegram.org', 'theguardian.com', 'tiktok.com', 'twitch.tv', 'twitter.com',
  'vercel.com', 'vuejs.org', 'walmart.com', 'whatsapp.com', 'wordpress.com', 'wordpress.org', 'x.com', 'yahoo.com', 'youtube.com'
]

export function knownToBlock(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  return KNOWN_BLOCKERS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null
}

export type Embeddable = 'checking' | 'ok' | 'blocked' | 'unknown'

/**
 * Finds out whether a site will show inside a frame. An iframe fires `load`
 * whether or not the browser refused to render the page, so it cannot tell.
 * An <object> pointed at the same address fires `error` when the site's
 * headers forbid embedding (or the site is unreachable), and `load` otherwise.
 */
export function probeEmbeddable(url: string): Promise<Embeddable> {
  return new Promise((resolve) => {
    const probe = document.createElement('object')
    let settled = false
    const finish = (result: Embeddable): void => {
      if (settled) return
      settled = true
      probe.remove()
      resolve(result)
    }
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:8px;height:8px;visibility:hidden'
    probe.setAttribute('aria-hidden', 'true')
    probe.onload = () => finish('ok')
    probe.onerror = () => finish('blocked')
    probe.data = url
    document.body.appendChild(probe)
    window.setTimeout(() => finish('unknown'), 9000)
  })
}

interface HelperMessage {
  source: 'facet-helper'
  type: 'ready' | 'frame'
  version?: string
  pane?: string
  url?: string
  overflow?: number
  /** True when the report follows something the user did in that frame. */
  active?: boolean
}

const send = (message: object): void => window.postMessage({ source: 'facet-web', ...message }, location.origin)

export function connectHelper(): () => void {
  const onMessage = (event: MessageEvent<HelperMessage>): void => {
    if (event.source !== window || event.data?.source !== 'facet-helper') return
    const data = event.data
    const store = useStore.getState()
    if (data.type === 'ready') {
      store.set({ helperVersion: data.version ?? 'unknown' })
      send({ type: 'config', mirror: store.mirror })
    } else if (data.type === 'frame' && data.pane) {
      const patch: Partial<ReturnType<typeof useStore.getState>> = {
        frameUrls: { ...store.frameUrls, [data.pane]: data.url ?? '' },
        overflow: { ...store.overflow, [data.pane]: data.overflow ?? 0 }
      }
      // Following a link in one device moves the address bar, and with it every
      // other device. With mirroring off, devices are left to browse on their own.
      if (store.mirror && data.active && data.url && !data.pane.endsWith(':b') && data.url !== store.url) patch.url = data.url
      store.set(patch)
    }
  }
  window.addEventListener('message', onMessage)
  send({ type: 'hello' })
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.mirror !== prev.mirror) send({ type: 'config', mirror: s.mirror })
  })
  return () => {
    window.removeEventListener('message', onMessage)
    unsubscribe()
  }
}
