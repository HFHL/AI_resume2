export const config = { runtime: 'nodejs' }
// 最简版：纯明文比对，用直连 REST，设置显式超时，便于排查超时问题

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null
    const username = (body?.username || '').trim()
    const password = body?.password || ''
    if (!username || !password) return new Response(JSON.stringify({ detail: 'username 与 password 必填' }), { status: 400 })

    const base = process.env.SUPABASE_URL as string | undefined
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!base || !key) return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 SERVICE_ROLE_KEY/KEY' }), { status: 500 })

    const endpoint = `${base.replace(/\/$/, '')}/rest/v1/auth_users?select=id,username,password_hash,role,is_active&username=eq.${encodeURIComponent(username)}&limit=1`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    let row: any = null
    try {
      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json',
        },
        signal: ctrl.signal,
      })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        return new Response(JSON.stringify({ detail: `Supabase ${resp.status}: ${txt || resp.statusText}` }), { status: 500 })
      }
      const arr = await resp.json().catch(() => null)
      row = Array.isArray(arr) ? (arr[0] || null) : null
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? '连接 Supabase 超时' : `连接 Supabase 失败: ${e?.message || String(e)}`
      return new Response(JSON.stringify({ detail: msg }), { status: 500 })
    } finally {
      clearTimeout(timer)
    }

    if (!row || row.is_active === false) return new Response(JSON.stringify({ detail: '账号不存在或已禁用' }), { status: 401 })

    const ok = String(row.password_hash || '') === password
    if (!ok) return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { status: 401 })

    return new Response(JSON.stringify({ ok: true, user: { id: row.id, username: row.username, role: row.role } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || '服务器错误' }), { status: 500 })
  }
}


