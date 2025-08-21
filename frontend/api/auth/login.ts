import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined
    console.log('[auth/login] env check', { hasUrl: Boolean(SUPABASE_URL), hasKey: Boolean(SUPABASE_SERVICE_ROLE_KEY) })
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // 支持 GET/POST：优先从 query 读取；POST 解析 JSON 文本
    let account: string | undefined
    let password: string | undefined
    if (req.method === 'GET') {
      let url: URL
      try { url = new URL(req.url) } catch { url = new URL(req.url, 'http://localhost') }
      account = url.searchParams.get('account') || url.searchParams.get('username') || undefined
      password = url.searchParams.get('password') || undefined
    } else if (req.method === 'POST') {
      let bodyText = ''
      try { bodyText = await req.text() } catch { bodyText = '' }
      try {
        const json = bodyText ? JSON.parse(bodyText) : null
        account = json?.account || json?.username
        password = json?.password
      } catch {
        account = undefined
        password = undefined
      }
    } else {
      return new Response(JSON.stringify({ detail: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('[auth/login] parsed params (masked)', { account, hasPassword: Boolean(password) })
    if (!account || !password) {
      return new Response(JSON.stringify({ detail: 'account/username 与 password 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // 直接调用 Supabase REST（7 秒超时）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const restUrl = `${SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/app_users?select=*&account=eq.${encodeURIComponent(account)}`
    const resp = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    }).catch((e) => {
      console.error('[auth/login] fetch error', e)
      return null as unknown as Response
    })
    clearTimeout(timeout)

    if (!resp) {
      return new Response(JSON.stringify({ detail: 'Supabase 请求失败' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return new Response(JSON.stringify({ detail: `Supabase 错误: ${resp.status}`, body: text }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const rows = await resp.json().catch(() => []) as any[]
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    console.log('[auth/login] rest result row', { hasRow: Boolean(row) })

    if (!row) {
      return new Response(JSON.stringify({ success: false, detail: '用户不存在', user: null }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    if (String(password) === String((row as any).password ?? '')) {
      return new Response(JSON.stringify({ success: true, user: row }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ success: false, detail: '密码不正确', user: row }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[auth/login] unhandled error (outer)', e)
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


