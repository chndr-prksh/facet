import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

// The website shares the device catalogue and the UI kit with the desktop app.
export default defineConfig({
  root: here('.'),
  // Relative, so the same build works at a domain root and under /facet/ on GitHub Pages.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': here('../src/shared'),
      '@ui': here('../src/renderer/src/components/ui.tsx'),
      '@styles': here('../src/renderer/src/styles')
    }
  },
  build: { outDir: here('dist'), emptyOutDir: true },
  server: { port: 5180 },
  preview: { port: 5181 }
})
