import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 只代理非uploads的API请求到Python后端
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        bypass: (req) => {
          // 如果是uploads相关的请求，不代理
          if (req.url?.includes('/api/uploads/')) {
            return req.url;
          }
        },
      },
    },
  },
})