import { createClient } from '@supabase/supabase-js'
// 已移除鉴权
export const config = { runtime: 'nodejs' }

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
    // 无鉴权，直接查询
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('id', id)
      .limit(1)

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    const item = (data || [])[0]
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404 })
    return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    // 无鉴权，允许更新
    const body = await req.json().catch(() => null)
    if (!body) return new Response(JSON.stringify({ detail: 'request body required' }), { status: 400 })

    const payload = {
      position_name: body.position_name || '',
      position_description: body.position_description ?? null,
      position_category: body.position_category ?? null,
      required_keywords: Array.isArray(body.required_keywords) ? body.required_keywords : [],
      match_type: body.match_type === 'all' ? 'all' : 'any',
      tags: Array.isArray(body.tags) ? body.tags : [],
    }

    const { data, error } = await supabase
      .from('positions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .limit(1)

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    const item = (data || [])[0]
    if (!item) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
