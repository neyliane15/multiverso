/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwind()],
  root: 'web',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  build: { outDir: '../dist', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['web/src/**/*.test.ts', 'web/src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    root: '.',
  },
})
