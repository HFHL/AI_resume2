import { createClient } from '@supabase/supabase-js'
import { requireAdmin, requireUser } from '../_auth'
export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    try { await requireUser(req) } catch (e: any) { return e instanceof Response ? e : new Response('Unauthorized', { status: 401 }) }
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
    try { await requireAdmin(req) } catch (e: any) { return e instanceof Response ? e : new Response('Forbidden', { status: 403 }) }
    const body = await req.json().catch(() => null)
    if (!body || !body.position_name) return new Response(JSON.stringify({ detail: 'position_name required' }), { status: 400 })

    const payload = {
      position_name: body.position_name,
      position_description: body.position_description ?? null,
      position_category: body.position_category ?? null,
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
