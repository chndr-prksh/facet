/*
 * Facet Helper, background worker.
 *
 * 1. In tabs showing Facet Web, removes the response headers that stop a site
 *    from being displayed in a frame. The rule is scoped to those tabs only;
 *    every other tab keeps its normal protection.
 * 2. Relays mirrored interactions between the device frames of such a tab.
 *    Frames talk through the extension, not through the page, so a framed
 *    site cannot forge events for its neighbours.
 */

// Pages allowed to host device frames. Anything else is ignored, which is
// what keeps a random site from asking this extension to unlock framing.
const HOSTS = ['https://chndr-prksh.github.io/facet/', 'http://localhost:5180/', 'http://localhost:5181/', 'http://127.0.0.1:5180/', 'http://127.0.0.1:5181/']
const HOME = HOSTS[0]
const RULE_ID = 1

const isHost = (url) => !!url && HOSTS.some((prefix) => url.startsWith(prefix))

/** Per-tab state: whether mirroring is on, and which frame the user last touched. */
const tabs = new Map()
const stateOf = (tabId) => {
  if (!tabs.has(tabId)) tabs.set(tabId, { mirror: true, activeFrame: -1, activeAt: 0, frames: null, framesAt: 0 })
  return tabs.get(tabId)
}

async function syncRule() {
  const open = (await chrome.tabs.query({})).filter((tab) => isHost(tab.url)).map((tab) => tab.id)
  const addRules = open.length
    ? [
        {
          id: RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              { header: 'x-frame-options', operation: 'remove' },
              { header: 'content-security-policy', operation: 'remove' },
              { header: 'content-security-policy-report-only', operation: 'remove' }
            ]
          },
          condition: { tabIds: open, resourceTypes: ['sub_frame'] }
        }
      ]
    : []
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID], addRules })
}

chrome.runtime.onInstalled.addListener(syncRule)
chrome.runtime.onStartup.addListener(syncRule)
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url !== undefined || change.status === 'loading') void syncRule()
})
chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId)
  void syncRule()
})

/** The device frames of a tab: direct children of the top frame. Cached briefly, since scroll events arrive in bursts. */
async function deviceFrames(tabId) {
  const state = stateOf(tabId)
  if (!state.frames || Date.now() - state.framesAt > 800) {
    const all = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
    state.frames = all.filter((frame) => frame.parentFrameId === 0).map((frame) => frame.frameId)
    state.framesAt = Date.now()
  }
  return state.frames
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const tab = sender.tab
  if (!tab || !isHost(tab.url)) return
  const state = stateOf(tab.id)

  switch (message.facet) {
    case 'hello':
      // From the host page, or from a frame asking whether it lives in one.
      void syncRule()
      respond({ host: true, version: chrome.runtime.getManifest().version, mirror: state.mirror })
      return
    case 'config':
      state.mirror = !!message.mirror
      return
    case 'active':
      state.activeFrame = sender.frameId
      state.activeAt = Date.now()
      return
    case 'sync':
      if (!state.mirror) return
      void deviceFrames(tab.id).then((frames) => {
        for (const frameId of frames) {
          if (frameId !== sender.frameId) chrome.tabs.sendMessage(tab.id, { facet: 'sync', event: message.event }, { frameId }).catch(() => {})
        }
      })
      return
    case 'frame':
      // A frame describing itself. "active" marks a navigation the user caused there.
      chrome.tabs
        .sendMessage(tab.id, { ...message, active: state.activeFrame === sender.frameId && Date.now() - state.activeAt < 8000 }, { frameId: 0 })
        .catch(() => {})
      return
  }
})

// Toolbar button: open the current page in Facet Web.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || !/^https?:/i.test(tab.url) || isHost(tab.url)) return void chrome.tabs.create({ url: HOME })
  void chrome.tabs.create({ url: `${HOME}?url=${encodeURIComponent(tab.url)}` })
})
