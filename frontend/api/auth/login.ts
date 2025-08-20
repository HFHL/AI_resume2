// 最简单的登录：直接查数据库，比较密码
import { createClient } from '@supabase/supabase-js'

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

    // 创建 Supabase 客户端
    console.log('创建 Supabase 客户端')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 查询用户
    console.log('开始查询用户:', username)
    const { data: user, error } = await supabase
      .from('auth_users')
      .select('id, username, password_hash, role, is_active')
      .eq('username', username)
      .single()

    console.log('查询结果:', { user: user ? '找到用户' : '未找到', error: error?.message })

    if (error || !user) {
      console.log('用户不存在或查询错误:', error?.message)
      return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!user.is_active) {
      console.log('用户已禁用')
      return new Response(JSON.stringify({ detail: '账号已禁用' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 比较密码（明文比较）
    console.log('比较密码')
    if (user.password_hash !== password) {
      console.log('密码错误')
      return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 登录成功
    console.log('登录成功')
    return new Response(JSON.stringify({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role 
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


