import { createClient } from '@supabase/supabase-js'
// 已移除鉴权
export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    // 无鉴权，直接查询
    const url = parseURL(req)
    const searchQuery = url.searchParams.get('q')?.trim()

    let query = supabase
      .from('positions')
      .select('id, position_name, position_category, tags, match_type, required_keywords, created_at')
      .order('id', { ascending: false })

    // 如果有搜索词，进行模糊搜索
    if (searchQuery) {
      query = query.or(
        `position_name.ilike.%${searchQuery}%,` +
        `position_category.ilike.%${searchQuery}%,` +
        `tags.cs.{${searchQuery}},` +
        `required_keywords.cs.{${searchQuery}}`
      )
    }

    const { data, error } = await query

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    // 无鉴权，允许创建
    let body: any = null
    try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
    if (!body || !body.position_name) return new Response(JSON.stringify({ detail: 'position_name required' }), { status: 400 })

    const payload = {
      position_name: String(body.position_name || '').trim(),
      position_description: String(body.position_description || '').trim(), // 表字段 NOT NULL
      position_category: String(body.position_category || '').trim(),       // 表字段 NOT NULL
      required_keywords: Array.isArray(body.required_keywords) ? body.required_keywords : [],
      match_type: body.match_type === 'all' ? 'all' : 'any',
      tags: Array.isArray(body.tags) ? body.tags : [],
    }

    const { data, error } = await supabase.from('positions').insert(payload).select('*').limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, position: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
