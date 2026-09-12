import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@market/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 手機實機測試需要從區網連入
    host: true,
    // 透過 ngrok 對外時，Vite 預設會擋掉未知的 Host header
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: false },
    },
  },
  // `vite preview` 用來驗證 production build（S7-5 效能量測）
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: false },
    },
  },
})
