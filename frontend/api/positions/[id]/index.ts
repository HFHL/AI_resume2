import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const url = parseURL(req)
  const idStr = ctx?.params?.id || url.pathname.split('/').filter(Boolean).pop()
  const id = Number(idStr)
  if (!id) return new Response(JSON.stringify({ detail: 'position id required' }), { status: 400 })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('positions').select('*').eq('id', id).limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    const item = (data || [])[0]
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404 })
    return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = await req.json().catch(() => ({}))
    const changes: Record<string, any> = {}
    for (const k of ['position_name','position_description','position_category','required_keywords','match_type','tags']) {
      if (k in body && body[k] !== undefined) changes[k] = body[k]
    }
    if (Object.keys(changes).length === 0) return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })

    const { data, error } = await supabase.from('positions').update(changes).eq('id', id).select('*').limit(1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, position: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
