export const config = { runtime: 'nodejs' }
// 最简单的登录：直接查数据库，比较密码
import { createClient } from '@supabase/supabase-js'

type VerifiedUserRow = {
  id: number
  username: string
  role: string
  is_active: boolean
}

export default async function handler(req: Request): Promise<Response> {
  console.log('登录接口被调用，方法:', req.method)
  
  if (req.method !== 'POST') {
    console.log('方法不允许:', req.method)
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    console.log('开始处理登录请求')
    
    // 获取请求参数
    const body = await req.json()
    console.log('请求体:', { username: body.username, hasPassword: !!body.password })
    
    const { username, password } = body
    
    if (!username || !password) {
      console.log('缺少用户名或密码')
      return new Response(JSON.stringify({ detail: '请输入用户名和密码' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 检查环境变量
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    
    console.log('环境变量检查:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      url: supabaseUrl?.substring(0, 20) + '...'
    })
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('缺少环境变量')
      return new Response(JSON.stringify({ detail: '服务配置错误' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 创建 Supabase 客户端（带 6s 超时）
    console.log('创建 Supabase 客户端')
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 6000)
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: (input: any, init?: any) => {
          return fetch(input, { ...(init || {}), signal: abortController.signal })
        },
      },
    })

    // 通过数据库 crypt() 验证（兼容 bcrypt 存储）
    console.log('通过 rpc 验证用户:', username)
    const { data: verified, error } = await supabase
      .rpc('verify_user_password', { p_username: username, p_password: password })
      .single()

    clearTimeout(timeoutId)

    console.log('验证结果:', { ok: !!verified, error: error?.message })

    if (error || !verified) {
      return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if ((verified as VerifiedUserRow).is_active === false) {
      return new Response(JSON.stringify({ detail: '账号已禁用' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 登录成功
    console.log('登录成功')
    return new Response(JSON.stringify({ 
      success: true, 
      user: { 
        id: (verified as VerifiedUserRow).id, 
        username: (verified as VerifiedUserRow).username, 
        role: (verified as VerifiedUserRow).role 
      } 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('登录错误:', error)
    return new Response(JSON.stringify({ detail: '服务器错误: ' + (error as Error).message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}


