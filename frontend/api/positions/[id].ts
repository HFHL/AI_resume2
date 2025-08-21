export const config = { runtime: 'edge' }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
  const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  if (!SUPABASE_URL || !KEY) return new Response(JSON.stringify({ detail: 'Missing SUPABASE env' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  let idStr: string | undefined
  try { const u = new URL(req.url); idStr = ctx?.params?.id || u.pathname.split('/').filter(Boolean).pop() } catch {}
  const id = Number(idStr)
  if (!id) return new Response(JSON.stringify({ detail: 'position id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const base = SUPABASE_URL.replace(/\/$/, '')

  if (req.method === 'GET') {
    const url = `${base}/rest/v1/positions?select=*&id=eq.${id}&limit=1`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' }, signal: controller.signal }).catch((e) => {
      console.error('[positions/[id]][GET] fetch error', e)
      return null as unknown as Response
    })
    clearTimeout(t)
    if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const rows = await r.json().catch(() => [])
    const item = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可修改职位' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    let body: any = null
    try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
    if (!body) return new Response(JSON.stringify({ detail: 'request body required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const payload = {
      position_name: String(body.position_name || '').trim(),
      position_description: String(body.position_description || '').trim(),
      position_category: String(body.position_category || '').trim(),
      required_keywords: Array.isArray(body.required_keywords) ? body.required_keywords : [],
      match_type: body.match_type === 'all' ? 'all' : 'any',
      tags: Array.isArray(body.tags) ? body.tags : [],
    }
    const url = `${base}/rest/v1/positions?id=eq.${id}`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch((e) => {
      console.error('[positions/[id]][PUT] fetch error', e)
      return null as unknown as Response
    })
    clearTimeout(t)
    if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const rows = await r.json().catch(() => [])
    const item = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可删除职位' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    const url = `${base}/rest/v1/positions?id=eq.${id}`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    const r = await fetch(url, { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation' }, signal: controller.signal }).catch((e) => {
      console.error('[positions/[id]][DELETE] fetch error', e)
      return null as unknown as Response
    })
    clearTimeout(t)
    if (!r) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    if (!r.ok) return new Response(JSON.stringify({ detail: await r.text() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const rows = await r.json().catch(() => [])
    const item = Array.isArray(rows) && rows.length ? rows[0] : null
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ ok: true, deleted: item }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
