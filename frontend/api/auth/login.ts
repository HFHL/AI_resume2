import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined
    console.log('[auth/login] env check', { hasUrl: Boolean(SUPABASE_URL), hasKey: Boolean(SUPABASE_SERVICE_ROLE_KEY) })
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // GET 支持：从查询参数读取 username/account 与 password
    let account: string | undefined
    let password: string | undefined
    if (req.method === 'GET') {
      let url: URL
      try { url = new URL(req.url) } catch { url = new URL(req.url, 'http://localhost') }
      account = url.searchParams.get('account') || url.searchParams.get('username') || undefined
      password = url.searchParams.get('password') || undefined
    } else if (req.method === 'POST') {
      // 兼容 Node.js 运行时没有 req.json 的情况
      let body: any = null
      try {
        const anyReq: any = req as any
        if (typeof anyReq.json === 'function') {
          body = await anyReq.json()
        } else if (typeof anyReq.text === 'function') {
          const txt = await anyReq.text()
          try { body = JSON.parse(txt) } catch { body = null }
        } else {
          // @ts-ignore
          const cloned = new Response((req as any).body)
          try { body = await cloned.json() } catch { body = null }
        }
      } catch {
        body = null
      }
      account = body?.account || body?.username
      password = body?.password
    } else {
      return new Response(JSON.stringify({ detail: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('[auth/login] incoming request', { method: req.method })
    console.log('[auth/login] parsed body (masked)', { account, hasPassword: Boolean(password) })

    if (!account || !password) {
      return new Response(JSON.stringify({ detail: 'account/username 与 password 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    try {
      // 直接从 app_users 查找并做明文字符串匹配
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('account', account)
        .limit(1)

      const row = (Array.isArray(data) && data.length > 0) ? data[0] : null
      console.log('[auth/login] supabase query result', { hasError: Boolean(error), row })

      if (error) {
        return new Response(JSON.stringify({ detail: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }

      if (!row) {
        return new Response(JSON.stringify({ success: false, detail: '用户不存在', user: null }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      }

      // 打印该账号的所有信息（包含明文密码），仅用于调试
      console.log('[auth/login] fetched user row', row)

      if (String(password) === String((row as any).password ?? '')) {
        return new Response(JSON.stringify({ success: true, user: row }), { headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: false, detail: '密码不正确', user: row }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    } catch (err: any) {
      console.error('[auth/login] query error', err)
      return new Response(JSON.stringify({ detail: err?.message || 'Query Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  } catch (e: any) {
    console.error('[auth/login] unhandled error (outer)', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


