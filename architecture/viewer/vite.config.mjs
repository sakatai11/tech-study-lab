import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { graphDataPlugin } from './graph-data.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const viewer = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    outDir: 'dist/client',
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    watch: { usePolling: true, interval: 500 },
    cors: false,
    fs: {
      strict: true,
      allow: [viewer, fileURLToPath(new URL('../traversal.mjs', import.meta.url))],
    },
    warmup: {
      clientFiles: ['./src/main.jsx'],
    },
  },
  plugins: [react(), graphDataPlugin(root)],
})
