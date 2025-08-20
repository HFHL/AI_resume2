export const config = { runtime: 'nodejs' }
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { setCookie } from '../_auth'

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null
    const username = (body?.username || '').trim()
    const password = body?.password || ''
    if (!username || !password) return new Response(JSON.stringify({ detail: 'username 与 password 必填' }), { status: 400 })

    const url = process.env.SUPABASE_URL as string | undefined
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!url || !key) return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 SERVICE_ROLE_KEY/KEY' }), { status: 500 })
    const supabase = createClient(url, key)

    const { data, error } = await supabase
      .from('auth_users')
      .select('id, username, password_hash, role, is_active')
      .eq('username', username)
      .limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 500 })
    const row = (data || [])[0] as any
    if (!row || row.is_active === false) return new Response(JSON.stringify({ detail: '账号不存在或已禁用' }), { status: 401 })

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { status: 401 })

    const b64 = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
    const cookie = setCookie('auth', b64, { httpOnly: true, sameSite: 'Lax', path: '/', secure: !!process.env.VERCEL })
    return new Response(JSON.stringify({ ok: true, user: { id: row.id, username: row.username, role: row.role } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || '服务器错误' }), { status: 500 })
  }
}


