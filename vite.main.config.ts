import path from 'node:path'

import { defineConfig } from 'vite'

// Runtime dependencies that must keep living in node_modules (asar) instead of
// being bundled: Electron itself, the Claude Agent SDK (it spawns the claude
// CLI binary from its per-platform package), and the native file-search module
// (pure JS wrapper that loads its FFI library at runtime). They are copied into
// the packaged app by the `packageAfterCopy` hook in forge.config.ts.
const external = ['electron', '@anthropic-ai/claude-agent-sdk', '@ff-labs/fff-node']

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@/shadcn',
        replacement: path.resolve(__dirname, './src/shadcn'),
      },
      {
        find: '@/shared',
        replacement: path.resolve(__dirname, './src/shared'),
      },
    ],
  },
  build: {
    rollupOptions: {
      external,
      output: {
        // Keep the conventional `.vite/build/main.js` output name even though
        // the entry now lives at `src/main/index.ts`.
        entryFileNames: 'main.js',
      },
    },
  },
})
