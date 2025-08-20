// 简单测试接口，验证 Vercel 函数是否正常
export default async function handler(req: Request): Promise<Response> {
  console.log('测试接口被调用，方法:', req.method)
  
  return new Response(JSON.stringify({ 
    message: '测试成功', 
    method: req.method,
    timestamp: new Date().toISOString(),
    env_check: {
      has_supabase_url: !!process.env.SUPABASE_URL,
      has_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      has_supabase_key: !!process.env.SUPABASE_KEY
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
