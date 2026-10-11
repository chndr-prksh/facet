// Hands the current tab's URL to the Facet desktop app through its facet://
// protocol, which the packaged app registers with the operating system.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !/^https?:/i.test(tab.url)) return
  const handoff = await chrome.tabs.create({ url: `facet://open?url=${encodeURIComponent(tab.url)}`, active: false })
  // The protocol launch leaves an empty tab behind; tidy it up.
  setTimeout(() => chrome.tabs.remove(handoff.id).catch(() => {}), 1500)
})
