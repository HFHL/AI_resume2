export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可操作' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!SUPABASE_URL || !KEY) return new Response(JSON.stringify({ detail: 'Missing SUPABASE env' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    const base = SUPABASE_URL.replace(/\/$/, '')

    if (req.method === 'GET') {
      const url = `${base}/rest/v1/app_users?select=id,full_name,account,is_admin,created_at,updated_at&order=created_at.desc`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' }, signal: controller.signal }).catch((e) => {
        console.error('[admin/users][GET] fetch error', e); return null as unknown as Response
      })
      clearTimeout(t)
      if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const items = await r.json().catch(() => [])
      return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    if (req.method === 'POST') {
      let body: any = null
      try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
      if (!body || !body.account || !body.full_name || !body.password) {
        return new Response(JSON.stringify({ detail: 'account, full_name, password 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      const row = {
        account: String(body.account),
        full_name: String(body.full_name),
        password: String(body.password),
        is_admin: Boolean(body.is_admin) || false,
      }
      const url = `${base}/rest/v1/app_users`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
        signal: controller.signal,
      }).catch((e) => { console.error('[admin/users][POST] fetch error', e); return null as unknown as Response })
      clearTimeout(t)
      if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const rows = await r.json().catch(() => [])
      const item = Array.isArray(rows) && rows.length ? rows[0] : null
      return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e: any) {
    console.error('[admin/users] unhandled', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


