import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('keywords').select('*').order('keyword')
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const kw = (body.keyword || '').trim()
    if (!kw) return new Response(JSON.stringify({ detail: 'keyword required' }), { status: 400 })

    const exists = await supabase.from('keywords').select('id, keyword').ilike('keyword', kw).limit(1)
    if (exists.error) return new Response(JSON.stringify({ detail: exists.error.message }), { status: 400 })
    if ((exists.data || []).length) return new Response(JSON.stringify({ ok: true, keyword: exists.data![0] }), { headers: { 'Content-Type': 'application/json' } })

    const { data, error } = await supabase.from('keywords').insert({ keyword: kw }).select('*').limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, keyword: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
