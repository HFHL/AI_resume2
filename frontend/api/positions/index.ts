export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
  const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  if (!SUPABASE_URL || !KEY) {
    return new Response(JSON.stringify({ detail: 'Missing SUPABASE_URL or KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    if (req.method === 'GET') {
      let search: string | null = null
      try {
        const u = new URL(req.url)
        search = u.searchParams.get('q')?.trim() || null
      } catch {}

      const base = SUPABASE_URL.replace(/\/$/, '')
      let restUrl = `${base}/rest/v1/positions?select=id,position_name,position_category,tags,match_type,required_keywords,created_at&order=id.desc`
      if (search) {
        // 简单 or 搜索（REST 端点不支持 or= 的复杂组合时，可退化到后端过滤。但这里先试 or=）
        const q = encodeURIComponent(search)
        restUrl += `&or=(position_name.ilike.%25${q}%25,position_category.ilike.%25${q}%25)`
      }

      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const resp = await fetch(restUrl, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
        signal: controller.signal,
      }).catch((e) => {
        console.error('[positions][GET] fetch error', e)
        return null as unknown as Response
      })
      clearTimeout(t)
      if (!resp) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        return new Response(JSON.stringify({ detail: txt || `HTTP ${resp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      const items = await resp.json().catch(() => [])
      return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    if (req.method === 'POST') {
      let body: any = null
      try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
      if (!body || !body.position_name) return new Response(JSON.stringify({ detail: 'position_name required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      const payload = {
        position_name: String(body.position_name || '').trim(),
        position_description: String(body.position_description || '').trim(),
        position_category: String(body.position_category || '').trim(),
        required_keywords: Array.isArray(body.required_keywords) ? body.required_keywords : [],
        match_type: body.match_type === 'all' ? 'all' : 'any',
        tags: Array.isArray(body.tags) ? body.tags : [],
      }

      const base = SUPABASE_URL.replace(/\/$/, '')
      const restUrl = `${base}/rest/v1/positions`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const resp = await fetch(restUrl, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch((e) => {
        console.error('[positions][POST] fetch error', e)
        return null as unknown as Response
      })
      clearTimeout(t)
      if (!resp) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        return new Response(JSON.stringify({ detail: txt || `HTTP ${resp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      const rows = await resp.json().catch(() => [])
      const position = Array.isArray(rows) && rows.length ? rows[0] : null
      return new Response(JSON.stringify({ ok: true, position }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e: any) {
    console.error('[positions] unhandled', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
