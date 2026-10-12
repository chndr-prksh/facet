import { useEffect, type ReactNode } from 'react'
import { DeviceDrawer } from './components/DeviceDrawer'
import { Help } from './components/Help'
import { Stage } from './components/Stage'
import { BlockedBanner, TopBar } from './components/TopBar'
import { connectHelper, probeEmbeddable } from './helper'
import { useStore } from './store'

export function App(): ReactNode {
  const theme = useStore((s) => s.theme)
  const drawerOpen = useStore((s) => s.drawerOpen)
  const help = useStore((s) => s.help)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(connectHelper, [])

  /* Check each open address once; the helper, when present, makes the check moot. */
  const url = useStore((s) => s.url)
  const compareUrl = useStore((s) => s.compareUrl)
  const helper = useStore((s) => !!s.helperVersion)
  useEffect(() => {
    if (helper) return
    for (const target of [url, compareUrl]) {
      if (!target || useStore.getState().embed[target]) continue
      // Our own demo page is same-origin and always embeddable.
      if (target.startsWith(location.origin)) continue
      useStore.setState((s) => ({ embed: { ...s.embed, [target]: 'checking' } }))
      void probeEmbeddable(target).then((result) => useStore.setState((s) => ({ embed: { ...s.embed, [target]: result } })))
    }
  }, [url, compareUrl, helper])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && useStore.getState().drawerOpen && !useStore.getState().help) useStore.setState({ drawerOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app web">
      <TopBar />
      <BlockedBanner />
      <div className="main">
        {drawerOpen ? <DeviceDrawer /> : null}
        <div className="stages">
          <Stage />
        </div>
      </div>
      {help ? <Help /> : null}
    </div>
  )
}
