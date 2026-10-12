/*
 * Facet Helper, bridge for the Facet Web page itself. The page cannot talk to
 * an extension directly, so this script passes messages between the two.
 */
;(() => {
  if (window.top !== window) return
  const toPage = (message) => window.postMessage({ source: 'facet-helper', ...message }, location.origin)

  const hello = () =>
    chrome.runtime
      .sendMessage({ facet: 'hello' })
      .then((reply) => reply?.host && toPage({ type: 'ready', version: reply.version }))
      .catch(() => {})

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'facet-web') return
    if (event.data.type === 'hello') void hello()
    else if (event.data.type === 'config') chrome.runtime.sendMessage({ facet: 'config', mirror: !!event.data.mirror }).catch(() => {})
  })

  chrome.runtime.onMessage.addListener((message) => {
    if (message.facet === 'frame') toPage({ type: 'frame', pane: message.pane, url: message.url, overflow: message.overflow, active: message.active })
  })

  void hello()
})()
