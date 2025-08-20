import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

export type AuthedUser = { id: number; username: string; role: 'admin' | 'staff' }

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') || ''
  const parts = raw.split(/;\s*/).filter(Boolean)
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k === name) return decodeURIComponent(v || '')
  }
  return null
}

export function setCookie(name: string, value: string, opts?: { maxAge?: number; secure?: boolean; path?: string; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None' }) {
  const segs: string[] = []
  segs.push(`${name}=${encodeURIComponent(value)}`)
  segs.push(`Path=${opts?.path ?? '/'}`)
  if (opts?.httpOnly !== false) segs.push('HttpOnly')
  if (opts?.sameSite) segs.push(`SameSite=${opts.sameSite}`)
  if (opts?.secure) segs.push('Secure')
  if (opts?.maxAge) segs.push(`Max-Age=${opts.maxAge}`)
  return segs.join('; ')
}

function parseBasicAuthCookie(req: Request): { username: string; password: string } | null {
  const b64 = getCookie(req, 'auth')
  if (!b64) return null
  try {
    let raw = ''
    if (typeof (globalThis as any).atob === 'function') {
      raw = decodeURIComponent(escape((globalThis as any).atob(b64)))
    } else if (typeof Buffer !== 'undefined') {
      raw = Buffer.from(b64, 'base64').toString('utf8')
    } else {
      return null
    }
    const idx = raw.indexOf(':')
    if (idx <= 0) return null
    const username = raw.slice(0, idx)
    const password = raw.slice(idx + 1)
    return { username, password }
  } catch {
    return null
  }
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL as string | undefined
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  if (!url || !key) throw new Error('缺少 SUPABASE_URL 或 SERVICE_ROLE_KEY/KEY')
  return createClient(url, key)
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const cred = parseBasicAuthCookie(req)
  if (!cred) throw new Response(JSON.stringify({ detail: '未登录' }), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('auth_users')
    .select('id, username, password_hash, role, is_active')
    .eq('username', cred.username)
    .limit(1)
  if (error) throw new Response(JSON.stringify({ detail: error.message }), { status: 500 })
  const row = (data || [])[0] as any
  if (!row || row.is_active === false) throw new Response(JSON.stringify({ detail: '账号不存在或已禁用' }), { status: 401 })

  const ok = await bcrypt.compare(cred.password, row.password_hash)
  if (!ok) throw new Response(JSON.stringify({ detail: '认证失败' }), { status: 401 })

  return { id: row.id as number, username: row.username as string, role: (row.role as 'admin' | 'staff') }
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const u = await requireUser(req)
  if (u.role !== 'admin') throw new Response(JSON.stringify({ detail: '需要管理员权限' }), { status: 403 })
  return u
}


