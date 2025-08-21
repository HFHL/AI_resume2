import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
  if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可操作' }), { status: 403 })

  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string) || (process.env.SUPABASE_KEY as string)
  )

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, full_name, account, is_admin, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    let body: any = null
    try { const t = await req.text(); body = t ? JSON.parse(t) : null } catch { body = null }
    if (!body || !body.account || !body.full_name || !body.password) {
      return new Response(JSON.stringify({ detail: 'account, full_name, password 必填' }), { status: 400 })
    }

    const row = {
      account: String(body.account),
      full_name: String(body.full_name),
      password: String(body.password), // 按要求明文
      is_admin: Boolean(body.is_admin) || false,
    }

    const { data, error } = await supabase
      .from('app_users')
      .insert(row)
      .select('id, full_name, account, is_admin, created_at, updated_at')
      .limit(1)

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, item: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}


