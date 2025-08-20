// 最简单的登录：直接查数据库，比较密码
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    // 获取请求参数
    const { username, password } = await req.json()
    
    if (!username || !password) {
      return new Response(JSON.stringify({ detail: '请输入用户名和密码' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 创建 Supabase 客户端
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 查询用户
    const { data: user, error } = await supabase
      .from('auth_users')
      .select('id, username, password_hash, role, is_active')
      .eq('username', username)
      .single()

    if (error || !user) {
      return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!user.is_active) {
      return new Response(JSON.stringify({ detail: '账号已禁用' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 比较密码（明文比较）
    if (user.password_hash !== password) {
      return new Response(JSON.stringify({ detail: '用户名或密码错误' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 登录成功
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
    console.error('Login error:', error)
    return new Response(JSON.stringify({ detail: '服务器错误' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}


