import { CircleCheck, Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from '@ui'
import { HELPER_AVAILABLE, REPO_URL, useStore } from '../store'

export function Help(): ReactNode {
  const helper = useStore((s) => s.helperVersion)
  return (
    <Modal title="Help" onClose={() => useStore.setState({ help: false })} width={640}>
      <div className="help">
        <section>
          <h3>Why is a device blank?</h3>
          <p>
            A website can tell browsers never to show it inside another page. Google, GitHub, YouTube, most banks and many large sites do. This page shows your link
            inside frames, so those sites come up empty. No website can override that; it takes a browser extension or a desktop app.
          </p>
          <p>Your own projects, anything on <code>localhost</code>, and most smaller sites work without any of this.</p>
        </section>

        {HELPER_AVAILABLE ? (
        <section>
          <h3>The helper extension {helper ? <span className="ok"><CircleCheck size={13} /> installed (v{helper})</span> : null}</h3>
          <p>
            A small, free Chrome and Edge extension that lifts the embedding block <b>only inside this tool's tab</b>, and adds mirroring: scroll, click or type in one
            device and the others follow. It also flags devices where the page overflows sideways.
          </p>
          {helper ? null : (
            <ol>
              <li>
                <a className="btn" href="./facet-helper.zip" download>
                  <Download size={13} /> Download facet-helper.zip
                </a>{' '}
                and unzip it.
              </li>
              <li>
                Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and switch on <b>Developer mode</b>.
              </li>
              <li>
                Choose <b>Load unpacked</b> and pick the unzipped folder, then reload this page.
              </li>
            </ol>
          )}
          <p className="dim">It is not on the Chrome Web Store yet, which is why the steps are manual. The source is in the repository.</p>
        </section>
        ) : (
          <section>
            <h3>How to view a site that refuses</h3>
            <p>
              Use the <a href={REPO_URL} target="_blank" rel="noopener">Facet desktop app</a>, which opens any site. A browser extension that lifts the block inside this page is on the way.
            </p>
          </section>
        )}

        <section>
          <h3>What is and is not simulated</h3>
          <ul>
            <li>
              <b>Exact:</b> the viewport width and height, so every media query and layout responds as it would on the device.
            </li>
            <li>
              <b>Not simulated:</b> pixel density, touch input, and the browser's identity. Those come from the browser you are using now.
            </li>
            <li>
              <b>Sign-in:</b> browsers restrict cookies inside frames, so logged-in pages often will not stay logged in here.
            </li>
            <li>
              <b>Local addresses:</b> Chrome asks permission before a website may reach <code>localhost</code>. Allow it once.
            </li>
          </ul>
          <p>
            The <a href={REPO_URL} target="_blank" rel="noopener">Facet desktop app</a> has none of these limits: it emulates pixel density, touch and user agents, opens any site, and audits every
            device for accessibility and layout problems.
          </p>
        </section>

        <section>
          <h3>Shortcuts</h3>
          <p>
            <kbd className="kbd">/</kbd> focuses the address box. Paste a link over the old one and it opens straight away. <b>Share</b> copies a link that reopens the same page on the same devices.
          </p>
        </section>
      </div>
    </Modal>
  )
}
