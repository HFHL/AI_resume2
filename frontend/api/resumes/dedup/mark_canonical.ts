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
    const keepId = Number(body?.keep_id)
    const hideIds = Array.isArray(body?.hide_ids) ? body.hide_ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []
    const groupKey = typeof body?.group_key === 'string' ? String(body.group_key) : null
    if (!Number.isFinite(keepId) || hideIds.length === 0) return new Response(JSON.stringify({ detail: 'keep_id 与 hide_ids 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const base = SUPABASE_URL.replace(/\/$/, '')
    // 1) 确保 keepId 为保留
    const updKeep = await fetch(`${base}/rest/v1/resumes?id=eq.${keepId}`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/json' },
      body: JSON.stringify({ is_dedup_hidden: false, canonical_id: null })
    })
    if (!updKeep.ok) {
      const txt = await updKeep.text().catch(() => '')
      return new Response(JSON.stringify({ detail: txt || `HTTP ${updKeep.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    // 2) 批量隐藏 hideIds
    const inList = hideIds.join(',')
    const updHide = await fetch(`${base}/rest/v1/resumes?id=in.(${inList})`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/json' },
      body: JSON.stringify({ is_dedup_hidden: true, canonical_id: keepId, dedup_group_key: groupKey, dedup_marked_at: new Date().toISOString(), dedup_marked_by: 'web' })
    })
    if (!updHide.ok) {
      const txt = await updHide.text().catch(() => '')
      return new Response(JSON.stringify({ detail: txt || `HTTP ${updHide.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const rows = await updHide.json().catch(() => []) as any[]
    return new Response(JSON.stringify({ ok: true, hidden_count: rows.length }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


