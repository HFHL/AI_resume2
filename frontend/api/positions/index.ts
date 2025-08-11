import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('positions')
      .select('id, position_name, position_category, tags, match_type, created_at')
      .order('id', { ascending: false })

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
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
