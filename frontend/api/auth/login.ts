import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => null)
  const account = body?.account || body?.username
  const password = body?.password

  console.log('[auth/login] incoming request', { method: req.method })
  console.log('[auth/login] parsed body (masked)', { account, hasPassword: Boolean(password) })

  if (!account || !password) {
    return new Response(JSON.stringify({ detail: 'account/username 与 password 必填' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // 直接从 app_users 查找并做明文字符串匹配（按你的要求，不考虑安全）
    // 沿用其他 API 的查询风格：limit(1) + 读取 data[0]
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('account', account)
      .limit(1)

    const row = (Array.isArray(data) && data.length > 0) ? data[0] : null
    console.log('[auth/login] supabase query result', { hasError: Boolean(error), row })

    if (error) {
      return new Response(JSON.stringify({ detail: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!row) {
      return new Response(JSON.stringify({ success: false, detail: '用户不存在', user: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 打印该账号的所有信息（包含明文密码），仅用于调试
    console.log('[auth/login] fetched user row', row)

    if (String(password) === String((row as any).password ?? '')) {
      return new Response(
        JSON.stringify({ success: true, user: row }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ success: false, detail: '密码不正确', user: row }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[auth/login] unhandled error', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}


