import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })
  const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
  if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可用' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const { searchParams } = parseURL(req)
  const minSize = Math.max(2, parseInt(searchParams.get('min_group_size') || '2', 10) || 2)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 1000)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

  const { data, error } = await supabase
    .from('resumes')
    .select('id, name, email, phone, created_at, is_dedup_hidden, canonical_id')
    .eq('is_deleted', false)
    .order('id', { ascending: false })

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const groups = new Map<string, any[]>()
  for (const r of (data || [])) {
    const nm = (r?.name ?? '').toString().trim().toLowerCase()
    const em = (r?.email ?? '').toString().trim().toLowerCase()
    const ph = (r?.phone ?? '').toString().trim()
    if (!nm) continue
    const key = nm + '|' + em + '|' + ph
    const arr = groups.get(key) || []
    arr.push(r)
    groups.set(key, arr)
  }
  const all = Array.from(groups.entries())
    .filter(([, arr]) => arr.length >= minSize)
    .map(([key, rows]) => {
      const sorted = rows.sort((a, b) => (b.id - a.id))
      return { key, count: sorted.length, ids: sorted.map((x: any) => x.id), rows: sorted }
    })
    .sort((a, b) => b.count - a.count)

  const total = all.length
  const items = all.slice(offset, offset + limit)
  return new Response(JSON.stringify({ items, total }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}


