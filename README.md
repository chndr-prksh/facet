# Facet

**Facet is a free, open-source tool for testing responsive web design.** It shows a web page on many phones, tablets, laptops and desktop monitors at once. It mirrors what you do in one device to all the others, and it checks every screen size for layout problems while you work: sideways scrolling, tiny tap targets, unreadable text and more.

Facet is an independent, open-source alternative to [Responsively App](https://github.com/responsively-org/responsively-app). It has the same core idea, plus real device emulation and built-in audits. It shares no code with Responsively.

It comes in three forms that share one catalogue of 292 device profiles:

- **[Facet Web](https://chndr-prksh.github.io/facet/)**: a website. Paste a link, see it on many screens. Nothing to install.
- **Facet desktop**: an Electron app with full device emulation, audits and an MCP server.
- **[facet-check](cli)**: a command-line tool and MCP server, so CI and AI coding agents can check a page on many devices: `npx facet-check localhost:3000`.

## Facet Web

**https://chndr-prksh.github.io/facet/**

Paste any link and it opens side by side on the devices you pick. A shared link reopens the same page on the same devices, for example
[this one](https://chndr-prksh.github.io/facet/?url=https://en.wikipedia.org/wiki/Responsive_web_design&devices=iphone-18-pro-max,galaxy-s26-ultra,ipad-mini,laptop-1536).

- 292 device profiles with search, presets, saved sets, any custom size, and drag-resizable panes.
- Side-by-side, wrapped and one-at-a-time layouts, fit-to-window zoom, rotation, device frames.
- A/B compare: a second link beside the first on every device.
- Column-grid and thumb-reach overlays.
- Works with `localhost`, so you can point it at a project in development.

**The limit every website of this kind has.** A site can tell browsers not to display it inside another page, and most large sites do (55 of 71 popular sites checked in October 2026). Facet Web detects this and says so instead of showing an unexplained blank pane. Because it uses frames, it also gets the viewport size exactly right but cannot change pixel density, touch input or the user agent; the desktop app does.

**Facet Helper** (in [`extension/`](extension)) is a small Chrome and Edge extension that removes that limit. In tabs showing Facet Web, and only there, it strips the headers that forbid framing, so any site loads. It also mirrors scrolling, clicks, typing and navigation between devices and flags devices where the page overflows sideways. Install it from the Help panel on the site (download, unzip, *Load unpacked*). It is not on the Chrome Web Store.

```bash
npm run web:dev        # the website on http://localhost:5180
npm run test:web       # 21 checks, with and without the extension
```

Pushing to `main` deploys the site to GitHub Pages.

## Command line, CI and AI agents

**[facet-check](cli)** loads a page in headless Chromium on several emulated devices and reports the problems on each. It gives the element at fault and how to fix it.

```bash
npx facet-check example.com                      # the six most common screen sizes
npx facet-check localhost:3000 -d phones --screenshots shots
npx facet-check https://example.com --json --fail-on error   # for CI
```

It also runs as an MCP server, so a coding agent can check its own CSS changes across screen sizes:

```bash
claude mcp add facet -- npx -y facet-check mcp
```

Tools: `check_responsive`, `screenshot`, `compare_element`, `audit_accessibility`, `list_devices`. See [cli/README.md](cli/README.md) for every option.

## Run the desktop app

```bash
npm install
npm run dev        # development, with hot reload
npm run pack       # builds dist/mac-arm64/Facet.app (unsigned)
npm test           # 55 end-to-end checks against the built app
```

Requires Node 20.19+ or 22.12+. `npm run dist` produces installers (dmg, nsis, AppImage); they are unsigned until you add signing credentials.

## What it does

**Devices**

- 292 built-in device profiles (see below), custom devices you can create *and edit*, and saved suites.
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

## The device catalogue

292 profiles, many covering several models that share a screen: 164 phones, 14 foldables, 34 tablets, 33 laptops, 23 desktop monitors, 11 watches, and TVs, consoles and smart displays. It runs from the iPhone 4 to 2026 models (iPhone 18 Pro, Galaxy S26, Pixel 11) and includes the most common real-world sizes, such as Android 360 × 800 and a Full HD Windows laptop at 125% scaling (1536 × 864).

Apple publishes logical resolutions, so those entries are exact. Android makers do not, and the value shifts with the user's display-size setting; entries derived from the panel resolution are marked `≈`. Sources: Apple's specifications, the Chrome DevTools device list, [yesviz.com](https://yesviz.com/viewport/), [screensize.io](https://www.screensize.io/devices.html) and [webmobilefirst.com](https://www.webmobilefirst.com/en/devices/). The catalogue lives in [`src/shared/devices.ts`](src/shared/devices.ts).

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
web/           Facet Web, the static site (shares src/shared and the UI kit)
extension/     Facet Helper, the browser extension for Facet Web
cli/           facet-check, the command-line tool and stdio MCP server (shares the device catalogue and audits)
e2e/           tests for the app, the website and the CLI, visual tour, fixture site
```

Pages run in sandboxed `<webview>` guests with context isolation and no Node access. The app UI has a strict content security policy and talks to the main process only through allow-listed channels.

## Testing

`npm test` builds the desktop app, launches it, and loads a fixture site with deliberate defects. It checks emulated viewports, mirroring (including a real pointer click through a zoomed pane), every audit, overlays, rotation, the MCP server, and reads pixels back from screenshots of a colour-block page to confirm captures are correct on every device. `npm run tour` walks every screen and saves screenshots to `e2e/artifacts/` for review. `npm run test:packaged` runs the same checks against the packaged app. `npm run test:cli` runs facet-check and its MCP server against the same fixture site (30 checks).

## FAQ

**How do I test my website on different screen sizes?**
Open [Facet Web](https://chndr-prksh.github.io/facet/), paste the link, and pick devices or a preset such as *Most common sizes*. For a full check with real emulation, use the desktop app, or run `npx facet-check <url>` to get a list of problems per device.

**How do I find what makes my page scroll sideways on mobile?**
Run `npx facet-check <url> -d phones`. For each phone it reports how far the page overflows and names the outermost element that sticks out, with a CSS selector. The desktop app's Issues panel shows the same, live, while you edit.

**Can an AI coding agent check responsive design?**
Yes. Add the MCP server with `claude mcp add facet -- npx -y facet-check mcp`, or the same command in Cursor, VS Code or any MCP client. The agent can then load a page on many devices, read the problems, take screenshots and compare an element across breakpoints.

**How is this different from Chrome DevTools device mode?**
DevTools shows one viewport at a time. Facet shows many side by side, keeps them in step as you scroll and click, and audits all of them at once.

**Does it test Safari?**
No. Every device renders with Chromium. An iPhone profile has the iPhone's screen size, pixel ratio, touch and user agent, but not Safari's WebKit engine.

**Is Facet a fork of Responsively App?**
No. It was written from scratch and shares no code with Responsively. Facet is MIT-licensed.
