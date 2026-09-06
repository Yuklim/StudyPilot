import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The explicit `.ts` extension keeps Vite's native config loader happy; without
// it the build prints a forward-compatibility warning on every run.
import { manifest, POPUP_PAGE } from './src/manifest.ts'

// Emitting the manifest from `src/manifest.ts` keeps one source of truth: the
// tests assert against the same module the build ships.
const emitManifest: Plugin = {
  name: 'studypilot-emit-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: JSON.stringify(manifest, null, 2) + '\n',
    })
  },
}

export default defineConfig({
  plugins: [emitManifest],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { popup: POPUP_PAGE } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
