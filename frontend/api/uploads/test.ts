export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  try {
    console.log('Test upload endpoint called')
    console.log('Method:', req.method)
    console.log('Headers:', Object.fromEntries(req.headers.entries()))
    
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    
    // 测试环境变量
    const envCheck = {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_KEY,
      nodeEnv: process.env.NODE_ENV
    }
    
    console.log('Environment check:', envCheck)
    
    // 返回测试响应
    return new Response(JSON.stringify({ 
      message: 'Test upload endpoint working',
      timestamp: new Date().toISOString(),
      env: envCheck,
      public_url: 'https://example.com/test-file.pdf'
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
    
  } catch (error: any) {
    console.error('Test endpoint error:', error)
    return new Response(JSON.stringify({ 
      error: error?.message || 'Unknown error'
    }), { status: 500 })
  }
}