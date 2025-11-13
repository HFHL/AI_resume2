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
    if (!id) return new Response(JSON.stringify({ detail: 'company id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    if (req.method === 'PUT') {
      let body: any = null
      try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
      if (!body) return new Response(JSON.stringify({ detail: 'request body required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      const patch: any = {}
      if (body.company_name !== undefined) patch.company_name = String(body.company_name).trim()
      if (body.category !== undefined) {
        const validCategories = ['金融量化', 'web3', '互联网', 'AI', '传统金融']
        if (!validCategories.includes(body.category)) {
          return new Response(JSON.stringify({ detail: `category 必须是以下之一: ${validCategories.join(', ')}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        patch.category = String(body.category)
      }

      const url = `${base}/rest/v1/highlight_companies?id=eq.${encodeURIComponent(id)}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      }).catch((e) => { console.error('[admin/highlight_companies/[id]][PUT] fetch error', e); return null as unknown as Response })
      clearTimeout(t)
      if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!r.ok) {
        const errorText = await r.text()
        if (errorText.includes('duplicate') || errorText.includes('unique')) {
          return new Response(JSON.stringify({ detail: '该公司名称已存在' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ detail: errorText }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      const rows = await r.json().catch(() => [])
      const item = Array.isArray(rows) && rows.length ? rows[0] : null
      if (!item) return new Response(JSON.stringify({ detail: '公司不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (req.method === 'DELETE') {
      const url = `${base}/rest/v1/highlight_companies?id=eq.${encodeURIComponent(id)}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, {
        method: 'DELETE',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        signal: controller.signal,
      }).catch((e) => { console.error('[admin/highlight_companies/[id]][DELETE] fetch error', e); return null as unknown as Response })
      clearTimeout(t)
      if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e: any) {
    console.error('[admin/highlight_companies/[id]] unhandled', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

