import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
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
  clearScreen: false,
})
