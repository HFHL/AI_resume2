export const config = { runtime: 'edge' }

function parseIdFromUrl(urlStr: string): number | null {
  let url: URL
  try { url = new URL(urlStr) } catch { url = new URL(urlStr, 'http://localhost') }
  const parts = url.pathname.split('/').filter(Boolean)
  const idStr = parts[parts.length - 2] || parts[parts.length - 1]
  const id = Number(idStr)
  return Number.isFinite(id) && id > 0 ? id : null
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST' && req.method !== 'PATCH') return new Response('Method Not Allowed', { status: 405 })
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可恢复' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!SUPABASE_URL || !KEY) return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

    const id = parseIdFromUrl(req.url)
    if (!id) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const base = SUPABASE_URL.replace(/\/$/, '')
    const url = `${base}/rest/v1/resumes?id=eq.${id}`
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        Accept: 'application/json',
      },
      body: JSON.stringify({ is_deleted: false, deleted_at: null }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return new Response(JSON.stringify({ detail: txt || `HTTP ${resp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const rows = await resp.json().catch(() => []) as any[]
    const updated = Array.isArray(rows) && rows.length ? rows[0] : null
    return new Response(JSON.stringify({ ok: true, item: updated }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


