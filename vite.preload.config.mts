import path from 'node:path'

import { defineConfig, type Plugin } from 'vite'

/**
 * @electron-forge/plugin-vite still defaults preload builds to the deprecated
 * `inlineDynamicImports` option, which Rolldown warns about on every build.
 * Fold it into the equivalent `codeSplitting: false` before Vite resolves the
 * build options; the hook becomes a no-op once the plugin stops setting it.
 */
function normalizeLegacyInlineDynamicImports(): Plugin {
  return {
    name: 'clotho:normalize-legacy-inline-dynamic-imports',
    config(config) {
      const output = config.build?.rollupOptions?.output
      if (Array.isArray(output) || output?.inlineDynamicImports === undefined) return
      const { inlineDynamicImports } = output
      output.codeSplitting = inlineDynamicImports ? false : undefined
      delete output.inlineDynamicImports
    },
  }
}

export default defineConfig({
  plugins: [normalizeLegacyInlineDynamicImports()],
  build: {
    rollupOptions: {
      output: {
        // Keep the conventional `.vite/build/preload.js` output name even
        // though the entry now lives at `src/preload/index.ts`.
        entryFileNames: 'preload.js',
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@/shadcn',
        replacement: path.resolve(import.meta.dirname, './src/shadcn'),
      },
      {
        find: '@/shared',
        replacement: path.resolve(import.meta.dirname, './src/shared'),
      },
    ],
  },
})
