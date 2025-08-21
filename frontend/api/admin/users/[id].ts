export const config = { runtime: 'edge' }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可操作' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!SUPABASE_URL || !KEY) return new Response(JSON.stringify({ detail: 'Missing SUPABASE env' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    const base = SUPABASE_URL.replace(/\/$/, '')

    let id: string | undefined
    try { const u = new URL(req.url); id = (ctx?.params?.id || u.pathname.split('/').filter(Boolean).pop()) as string } catch {}
    if (!id) return new Response(JSON.stringify({ detail: 'user id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    if (req.method === 'PUT') {
      let body: any = null
      try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
      if (!body) return new Response(JSON.stringify({ detail: 'request body required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      const patch: any = {}
      if (body.full_name !== undefined) patch.full_name = String(body.full_name)
      if (body.account !== undefined) patch.account = String(body.account)
      if (body.password !== undefined) patch.password = String(body.password)
      if (body.is_admin !== undefined) patch.is_admin = Boolean(body.is_admin)

      const url = `${base}/rest/v1/app_users?id=eq.${encodeURIComponent(id)}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      }).catch((e) => { console.error('[admin/users/[id]][PUT] fetch error', e); return null as unknown as Response })
      clearTimeout(t)
      if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const rows = await r.json().catch(() => [])
      const item = Array.isArray(rows) && rows.length ? rows[0] : null
      if (!item) return new Response(JSON.stringify({ detail: '用户不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e: any) {
    console.error('[admin/users/[id]] unhandled', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


