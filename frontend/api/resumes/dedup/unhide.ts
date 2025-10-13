export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可用' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!SUPABASE_URL || !KEY) return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

    let body: any = null
    try { body = await req.json() } catch {}
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []
    if (ids.length === 0) return new Response(JSON.stringify({ detail: 'ids 不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const base = SUPABASE_URL.replace(/\/$/, '')
    const inList = ids.join(',')
    const upd = await fetch(`${base}/rest/v1/resumes?id=in.(${inList})`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/json' },
      body: JSON.stringify({ is_dedup_hidden: false, canonical_id: null })
    })
    if (!upd.ok) {
      const txt = await upd.text().catch(() => '')
      return new Response(JSON.stringify({ detail: txt || `HTTP ${upd.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const rows = await upd.json().catch(() => []) as any[]
    return new Response(JSON.stringify({ ok: true, count: rows.length }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


