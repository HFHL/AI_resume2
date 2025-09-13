export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
  const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  if (!SUPABASE_URL || !KEY) {
    return new Response(JSON.stringify({ detail: 'Missing SUPABASE_URL or KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

    const base = SUPABASE_URL.replace(/\/$/, '')
    const url = `${base}/rest/v1/outsourcing_companies?select=id,company_name,alt_names,is_active&order=company_name.asc`

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(url, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
      signal: controller.signal,
    }).catch(() => null as unknown as Response)
    clearTimeout(t)
    if (!resp) return new Response(JSON.stringify({ detail: 'Supabase request failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return new Response(JSON.stringify({ detail: txt || `HTTP ${resp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const items = await resp.json().catch(() => [])
    return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


