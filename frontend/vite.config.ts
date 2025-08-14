import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 推荐使用 `vercel dev` 本地模拟 Vercel Functions；若未使用，可暂不代理
    },
  },
})