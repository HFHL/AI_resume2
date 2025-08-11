export const API_BASE = ((): string => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined
  if (envBase && envBase.trim()) return envBase.trim()
  // 在 Vercel 上，使用相对 /api 走 Serverless Functions；本地默认后端端口
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    return isLocal ? 'http://localhost:8000' : '/api'
  }
  return '/api'
})()

export function api(path: string): string {
  if (path.startsWith('http')) return path
  if (!path.startsWith('/')) path = '/' + path
  return `${API_BASE}${path}`
}


