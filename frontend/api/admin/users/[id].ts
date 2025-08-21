import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

function parseURL(req: Request) { try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') } }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
  if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可操作' }), { status: 403 })

  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string) || (process.env.SUPABASE_KEY as string)
  )

  const url = parseURL(req)
  const id = (ctx?.params?.id || url.pathname.split('/').filter(Boolean).pop()) as string
  if (!id) return new Response(JSON.stringify({ detail: 'user id required' }), { status: 400 })

  if (req.method === 'PUT') {
    let body: any = null
    try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
    if (!body) return new Response(JSON.stringify({ detail: 'request body required' }), { status: 400 })

    const patch: any = {}
    if (body.full_name !== undefined) patch.full_name = String(body.full_name)
    if (body.account !== undefined) patch.account = String(body.account)
    if (body.password !== undefined) patch.password = String(body.password)
    if (body.is_admin !== undefined) patch.is_admin = Boolean(body.is_admin)

    const { data, error } = await supabase
      .from('app_users')
      .update(patch)
      .eq('id', id)
      .select('id, full_name, account, is_admin, created_at, updated_at')
      .limit(1)

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    const item = (data || [])[0]
    if (!item) return new Response(JSON.stringify({ detail: '用户不存在' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, item }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}


