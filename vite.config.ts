/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwind()],
  root: 'web',
  // O root e web/, e por padrao o Vite procuraria o .env la dentro. Mas o
  // .env.example mora na raiz do repositorio e o README manda copia-lo para a
  // raiz — quem seguisse a instrucao subia o app sem variavel nenhuma e batia
  // no "Faltam VITE_SUPABASE_URL...". O env mora com o .env.example.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
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
