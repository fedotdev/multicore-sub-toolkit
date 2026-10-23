import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// base для GitHub Pages project page: /<repo>/.
// Локально и в preview — "/". В Actions задаётся через env VITE_BASE.
export default defineConfig({
  plugins: [preact()],
  base: process.env.VITE_BASE ?? '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
