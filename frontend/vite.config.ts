import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev proxy keeps cookies first-party; no CORS involvement in development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
