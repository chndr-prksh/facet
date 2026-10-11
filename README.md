# Facet

A desktop browser for responsive web development. It shows one page on many devices at once, mirrors what you do in one to all the others, and checks every viewport for problems while you work.

Facet was built as an answer to [Responsively App](https://github.com/responsively-org/responsively-app): the same core idea, with real device emulation and built-in audits added. It is an independent implementation and shares no code with Responsively.

## Run it

```bash
npm install
npm run dev        # development, with hot reload
npm run pack       # builds dist/mac-arm64/Facet.app (unsigned)
npm test           # 55 end-to-end checks against the built app
```

Requires Node 20.19+ or 22.12+. `npm run dist` produces installers (dmg, nsis, AppImage); they are unsigned until you add signing credentials.

## What it does

**Devices**

- 50 built-in devices (phones, foldables, tablets, laptops, desktops, a watch), custom devices you can create *and edit*, and saved suites.
- Resizable panes with drag handles and typed dimensions, for hunting the exact width where a layout breaks.
- Row, wrap and one-at-a-time layouts, fit-to-window zoom, optional device frames, rotation.
- Tabs, each with its own page, devices and emulation.

**Real emulation, not a resized window.** Each pane is driven over the Chrome DevTools Protocol, so a phone pane has the phone's pixel ratio, user agent, touch capability and mobile viewport behaviour. A page with no viewport meta tag lays out at 980px and shrinks, as it would on a real phone.

- Per tab, overridable per device: colour scheme, contrast, reduced motion, forced colours, reduced transparency, print media, six vision deficiencies.
- Network throttling (Fast 4G, Slow 4G, 3G, offline) and CPU throttling.
- Locale, time zone, geolocation, user agent, extra request headers, JavaScript off, cache off.
- Full-screen web app mode, which applies the device's safe-area insets.

**Mirroring.** Scrolling, clicks, typing, form submits and navigation are replayed in every pane. Scroll is matched by relative position, so pages of different heights stay in step. A click on an element that is hidden at another viewport is skipped there. Only the pane you are using drives navigation, which is what prevents redirect loops when a site sends phones and desktops to different URLs.

**Audits across all devices**

- *Issues*: horizontal overflow and the element causing it, tap targets under 24px, text under 12px, form fields that trigger iOS zoom, viewport meta mistakes, clipped text, oversized or upscaled images, fixed elements covering the screen. Grouped by device or merged by issue.
- *Accessibility*: axe-core, run in whichever device you choose.
- *SEO*: metadata checks, and previews of the page as a Google result and as a link shared on X, Facebook, LinkedIn, Slack and Discord.
- *Outline*: headings (with skipped levels flagged), landmarks, links (with a broken-link checker), images and their alt text.
- *Breakpoints*: read from the page's stylesheets, with one click to open a pane at each, and a warning for ranges no open device covers.
- *Console*: messages from every device merged into one list. A message that only one device logs is a viewport-specific bug.
- A live overflow badge and web vitals (LCP, CLS, INP) on every pane.

**Tools**

- Element compare: pick an element and see its size and computed styles side by side on every device, with differing rows highlighted.
- A/B compare: load a second URL beside the first on every device (local against production, say), mirrored together, with a pixel diff.
- 23 overlays: element outlines, flex and grid containers, column and baseline grids, z-index, thumb reach, tap target sizes, safe areas, heading levels, landmarks, tab order, alt text, text spacing (WCAG 1.4.12), right-to-left, longer and shorter copy, no images, no CSS.
- Screenshots of one or all devices, viewport or full page, plus a studio that composes every device into one framed image.
- Design overlay: lay a mockup image over a pane with adjustable opacity or difference blending.
- Live CSS injected into every pane as you type, saved JavaScript snippets, cookie and storage inspector.
- Live reload for static files: CSS edits are swapped in place, anything else reloads.
- Command palette (`Cmd/Ctrl+K`) with every action in the app.

**AI agents.** A built-in [Model Context Protocol](https://modelcontextprotocol.io) server lets a coding agent open pages, screenshot every device, and run the audits. Turn it on in Settings, then:

```bash
claude mcp add --transport http facet http://127.0.0.1:12790/mcp
```

Sixteen tools: `get_state`, `navigate`, `list_devices`, `set_devices`, `screenshot`, `audit_responsive`, `audit_accessibility`, `get_meta`, `get_console`, `get_breakpoints`, `compare_element`, `read_page`, `click`, `type_text`, `scroll`, `set_emulation`. The server is off by default, listens on 127.0.0.1 only, and rejects cross-origin requests.

## Shortcuts

| | |
|---|---|
| `Cmd+K` | Command palette |
| `Cmd+L` | Address bar |
| `Cmd+T` / `Cmd+W` | New tab / close tab |
| `Cmd+R` / `Cmd+Shift+R` | Reload all / hard reload |
| `Cmd+I` | Compare an element across devices |
| `Cmd+Shift+A` | Run all audits |
| `Cmd+Shift+S` / `Cmd+Alt+S` | Screenshot all devices / full page |
| `Cmd+Shift+P` | Screenshot studio |
| `Cmd+Shift+D` | Toggle light / dark |
| `Cmd+Shift+M` | Manage devices |
| `Cmd+Alt+R` | Rotate all |
| `Cmd+J` | Side panel |
| `Cmd+0` / `Cmd+=` / `Cmd+-` | Fit / zoom in / zoom out |

Use `Ctrl` in place of `Cmd` on Windows and Linux. Shortcuts keep working while a device pane has focus.

## Limits worth knowing

- **Chromium only.** Every pane renders with Chromium. Safari- and Firefox-specific bugs still need those browsers; an iPhone pane emulates the iPhone's viewport, not WebKit.
- **Screenshot resolution** is the lower of the device's pixel ratio and your display's. A 3x phone captured on a 2x display is a 2x image.
- **Mouse-to-touch gestures** are off by default. Touch *capability* (media queries, touch points, `ontouchstart`) is always emulated per device; the hand button in the toolbar additionally turns mouse drags into touch events while the pointer is over a touch pane.
- **Mirroring** matches elements by CSS path, so it does not reach into shadow DOM or cross-origin iframes.
- **Unsigned builds.** macOS will ask you to confirm opening the packaged app.

## How it is put together

```
src/
  shared/      types, device catalogue, URL helpers
  main/        Electron main process
    panes.ts     one CDP session per device pane; applies emulation
    capture.ts   screenshots (viewport, and scroll-and-stitch full page)
    mcp.ts       Model Context Protocol server
    services.ts  persistence, cookies, link checker, dev-server scan, file watching
  preload/
    host.ts      narrow, allow-listed bridge for the app UI
    guest.ts     runs in every pane: mirroring, metrics, vitals, element picker
  renderer/    React UI
    lib/views.ts     pane registry, navigation and mirroring rules
    lib/scripts.ts   audits that are serialised and run inside pages
    lib/overlays.ts  the debug overlays
    panels/          the nine side panels
e2e/           smoke test, visual tour, fixture site
extension/     browser extension that sends the current tab to Facet
```

Pages run in sandboxed `<webview>` guests with context isolation and no Node access. The app UI has a strict content security policy and talks to the main process only through allow-listed channels.

## Testing

`npm test` builds the app, launches it, and loads a fixture site with deliberate defects. It checks emulated viewports, mirroring (including a real pointer click through a zoomed pane), every audit, overlays, rotation, the MCP server, and reads pixels back from screenshots of a colour-block page to confirm captures are correct on every device. `npm run tour` walks every screen and saves screenshots to `e2e/artifacts/` for review. `npm run test:packaged` runs the same checks against the packaged app.
