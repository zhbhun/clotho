import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  test: {
    dir: path.resolve(__dirname, 'src'),
    environment: 'jsdom',
    setupFiles: path.resolve(__dirname, './vitest.setup.ts'),
    css: true,
  },
})
