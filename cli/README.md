# facet-check

**Check a web page for responsive design problems on real phone, tablet and desktop viewports.** It runs from the command line, in CI, or as an [MCP](https://modelcontextprotocol.io) server that AI coding agents (Claude Code, Cursor, Codex, VS Code) can call.

```bash
npx @chandra14/facet-check localhost:3000
```

Or install it once with `npm install -g @chandra14/facet-check`, then run `facet-check localhost:3000`.

Output for a test page with a price table that is too wide for phones (shortened):

```
Facet check http://localhost:3000
6 devices · 14 errors · 14 warnings

✗ iPhone 16 393×852 @3x
  error Page scrolls sideways by 267px — The document is 660px wide in a 393px viewport.
  error Extends 267px past the viewport — <table.prices> “SizeWhole beanGroundSubscriptionWholesal”
        html > body > main > table
        fix: Constrain it with max-width: 100%, min-width: 0 on a flex child, overflow-wrap: anywhere, or let it scroll inside its own container.
  error Tap target is 13 × 13px — <input#weekly>
        #weekly
        fix: Targets must be at least 24 × 24px (WCAG 2.5.8); 44 × 44px is comfortable.
  warn  Field text is 14px, so iOS zooms in on focus — <input#email>
        #email
        fix: Give form controls font-size: 16px or larger.
  console Carousel failed to initialise at 393px

! Full HD laptop at 125% (most common) 1536×864 @1.25x
  warn  Text is only 10px — <p#terms> “Prices include tax. Orders placed after ”
```

Each device is a real emulation in headless Chromium, not a resized window. It uses the device's viewport, pixel ratio, touch support, mobile viewport behaviour and user agent. A page with no viewport meta tag lays out at 980px on a phone, as it would on the real device.

It is the command-line and agent side of [Facet](https://github.com/chndr-prksh/facet), an open-source browser for responsive web development. Facet's device catalogue has 290+ profiles, from the iPhone SE to 2026 flagships, foldables, tablets, laptops and 4K monitors.

## What it finds

On every device:

- **Horizontal scrolling**, and the element that causes it (the table, not each of its cells)
- **Tap targets** smaller than 24 × 24px on touch devices (WCAG 2.5.8)
- **Text** smaller than 12px, and text that is cut off without an ellipsis
- **Form fields** under 16px, which make iOS zoom in when focused
- **Viewport meta** problems: missing, not `device-width`, or zoom disabled
- **Images** that are far larger than needed, blurry on high-density screens, or missing dimensions
- **Fixed headers and banners** that cover too much of a small screen
- **Console errors**, uncaught exceptions and failed requests, per device. An error that only one device logs is a viewport-specific bug.

## Command line

```bash
npx @chandra14/facet-check <url> [options]
```

| Option | |
|---|---|
| `-d, --devices <list>` | Device ids, names, sizes like `1024x768`, or a preset (default: `popular`) |
| `-s, --screenshots <dir>` | Save a PNG of each device |
| `--full-page` | Capture the whole page, not only the first screen |
| `--json` | Print the full report as JSON |
| `--all` | Also list info-level notes |
| `--fail-on <level>` | Exit 1 when a finding is at least `error` (default), `warn` or `info`; `never` always exits 0 |
| `--timeout <ms>` | Page load timeout (default 30000) |
| `--list-devices [query]` | Show presets and the device catalogue |

The URL can be a full URL, a bare host (`example.com`), a local dev server (`localhost:3000`, `:5173`) or a path to an HTML file.

**Presets:** `popular` (the six most common real-world sizes), `default` (phone, tablet, laptop), `phones`, `latest`, `tablets`, `desktops`, `apple`, `foldables`, `extremes`.

```bash
npx @chandra14/facet-check localhost:3000 -d phones --screenshots shots
npx @chandra14/facet-check https://example.com -d iphone-17,"Galaxy S26",ipad,1440x900 --json
```

### In CI

The exit code is 1 when errors are found, so it can gate a pull request:

```yaml
- run: npx @chandra14/facet-check http://localhost:4173 --fail-on error
```

## MCP server for AI agents

`facet-check mcp` runs a Model Context Protocol server over stdio. An agent can then check its own CSS changes on many screen sizes and look at the result.

**Claude Code**

```bash
claude mcp add facet -- npx -y @chandra14/facet-check mcp
```

**Cursor, VS Code, Claude Desktop and other clients**

```json
{
  "mcpServers": {
    "facet": { "command": "npx", "args": ["-y", "@chandra14/facet-check", "mcp"] }
  }
}
```

| Tool | What it does |
|---|---|
| `check_responsive` | Loads a URL on several devices and returns the problems on each, with selectors and fixes |
| `screenshot` | Returns one labelled image per device (viewport or full page) |
| `compare_element` | Measures one element on every device: size, visibility, font size, display, flex and grid |
| `audit_accessibility` | Runs axe-core on one device and returns WCAG violations with fixes |
| `list_devices` | Lists the device catalogue and presets |

Then ask, for example: *"Check localhost:3000 on phones and fix anything that scrolls sideways."*

## Requirements

Node 20 or later and a Chromium-based browser. facet-check uses, in order: the browser at `FACET_CHROME`, Playwright's Chromium (`npx playwright install chromium`), Google Chrome, then Microsoft Edge. Most machines already have one of these.

## Limits

- **Chromium only.** An iPhone profile emulates the iPhone's screen, not Safari's WebKit engine. Safari-specific bugs still need Safari.
- It checks the page as it is after load. Content behind a login or a click is out of reach from the command line.

## License

MIT
