import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

// The host UI only ever runs its own bundled code. Remote images are allowed
// because the SEO panel previews a page's share images and favicons.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

const cspPlugin = {
  name: 'facet-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string): string => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
}

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // Both preloads run sandboxed, where local require() is unavailable, so
      // each must stay a single file: they import nothing but 'electron' and
      // types, which leaves Rollup no shared chunk to split out.
      externalizeDeps: false,
      rollupOptions: {
        input: { host: resolve('src/preload/host.ts'), guest: resolve('src/preload/guest.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), cspPlugin],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
