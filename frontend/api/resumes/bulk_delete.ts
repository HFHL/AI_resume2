export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ detail: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const EFFECTIVE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
    if (!SUPABASE_URL || !EFFECTIVE_KEY) {
      return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) {
      return new Response(JSON.stringify({ detail: '仅管理员可删除简历' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    let payload: any = null
    try { payload = await req.json() } catch { payload = null }
    const ids = Array.isArray(payload?.ids) ? payload.ids.filter((x: any) => Number.isFinite(Number(x))) : []
    const uniqIds = Array.from(new Set(ids.map((x: any) => Number(x)).filter((n: number) => n > 0))) as number[]
    if (uniqIds.length === 0) {
      return new Response(JSON.stringify({ detail: 'ids 不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // 限制每次最多删除 500 条，避免 URL 过长
    const maxBatch = 500
    const batch = uniqIds.slice(0, maxBatch)

    const base = SUPABASE_URL!.replace(/\/$/, '')
    const inList = batch.join(',')
    const delUrl = `${base}/rest/v1/resumes?id=in.(${inList})`

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 12000)
    const delResp = await fetch(delUrl, {
      method: 'DELETE',
      headers: {
        'apikey': EFFECTIVE_KEY!,
        'Authorization': `Bearer ${EFFECTIVE_KEY!}`,
        'Prefer': 'return=representation',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    }).catch((e) => {
      console.error('[api/resumes/bulk_delete] fetch error', e)
      return null as unknown as Response
    })
    clearTimeout(t)
    if (!delResp) {
      return new Response(JSON.stringify({ detail: 'Supabase 请求失败' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }
    if (!delResp.ok) {
      const text = await delResp.text().catch(() => '')
      return new Response(JSON.stringify({ detail: text || `DELETE failed ${delResp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const deletedRows = await delResp.json().catch(() => []) as any[]
    const deletedIds = Array.isArray(deletedRows) ? deletedRows.map((r: any) => r?.id).filter((n: any) => Number.isFinite(Number(n))) : []

    return new Response(JSON.stringify({ ok: true, count: deletedIds.length, deletedIds }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


