import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  const method = req.method
  if (method === 'GET') {
    const { data, error } = await supabase.from('keywords').select('*').order('keyword')
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }
  if (method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const keyword = (body.keyword || '').toString().trim()
    if (!keyword) return new Response(JSON.stringify({ detail: '关键词不能为空' }), { status: 400 })
    const { data, error } = await supabase.from('keywords').insert({ keyword }).select('*').limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, keyword: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('Method Not Allowed', { status: 405 })
}


