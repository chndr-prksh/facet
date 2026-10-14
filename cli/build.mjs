// Bundles the CLI with the shared device catalogue and the in-page audits.
// Runtime dependencies stay external and are installed with the package.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))

await build({
  entryPoints: [join(here, 'src', 'cli.ts')],
  outfile: join(here, 'dist', 'facet-check.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: Object.keys(pkg.dependencies),
  alias: { '@shared': join(here, '..', 'src', 'shared') },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: { js: '#!/usr/bin/env node' },
  // No minifying and no keepNames: the audit functions are sent to pages as
  // source text and must stay self-contained.
  logLevel: 'warning'
})
