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
      const url = new URL(req.url)
      const category = url.searchParams.get('category')
      const search = url.searchParams.get('search')
      
      let queryUrl = `${base}/rest/v1/highlight_companies?select=id,company_name,category,created_at,updated_at&order=category.asc,company_name.asc`
      
      if (category) {
        queryUrl += `&category=eq.${encodeURIComponent(category)}`
      }
      
      if (search) {
        queryUrl += `&company_name=ilike.*${encodeURIComponent(search)}*`
      }
      
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(queryUrl, { 
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' }, 
        signal: controller.signal 
      }).catch((e) => {
        console.error('[admin/highlight_companies][GET] fetch error', e)
        return null as unknown as Response
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
      if (!body || !body.company_name || !body.category) {
        return new Response(JSON.stringify({ detail: 'company_name 和 category 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      
      // 验证 category 是否有效
      const validCategories = ['金融量化', 'web3', '互联网', 'AI', '传统金融']
      if (!validCategories.includes(body.category)) {
        return new Response(JSON.stringify({ detail: `category 必须是以下之一: ${validCategories.join(', ')}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      
      const row = {
        company_name: String(body.company_name).trim(),
        category: String(body.category),
      }
      
      const url = `${base}/rest/v1/highlight_companies`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(url, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
        signal: controller.signal,
      }).catch((e) => { console.error('[admin/highlight_companies][POST] fetch error', e); return null as unknown as Response })
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
      return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e: any) {
    console.error('[admin/highlight_companies] unhandled', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

