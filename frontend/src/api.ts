export const API_BASE = ((): string => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined
  if (envBase && envBase.trim()) return envBase.trim()
  // 统一走 /api（Vercel Functions 或 vercel dev 代理）；不再指向 8000
  return '/api'
})()

export function api(path: string): string {
  if (path.startsWith('http')) return path
  if (!path.startsWith('/')) path = '/' + path
  // 本地开发时，/uploads/* 走线上 Vercel Functions，避免 Vite 本地 404；
  // 可通过 VITE_UPLOADS_BASE 覆盖（如使用 `vercel dev` 时设为 http://localhost:3000/api）
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (path.startsWith('/uploads/')) {
    const uploadsBase = isLocal
      ? (import.meta.env.VITE_UPLOADS_BASE as string | undefined) || '/api'
      : '/api'
    return `${uploadsBase}${path}`
  }

  return `${API_BASE}${path}`
}


