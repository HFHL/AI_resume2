export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    
    const body = await req.json().catch(() => null) as { file_name?: string, content_type?: string } | null
    if (!body || !body.file_name) {
      return new Response(JSON.stringify({ detail: 'file_name required' }), { status: 400 })
    }

    // 获取环境变量
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET
    const publicBase = process.env.R2_PUBLIC_BASE_URL
    
    // 检查必需的环境变量
    const missingVars = []
    if (!accountId) missingVars.push('R2_ACCOUNT_ID')
    if (!bucket) missingVars.push('R2_BUCKET')
    if (!publicBase) missingVars.push('R2_PUBLIC_BASE_URL')
    
    if (missingVars.length > 0) {
      return new Response(JSON.stringify({ 
        detail: `R2 环境变量未配置: ${missingVars.join(', ')}`,
        missing: missingVars 
      }), { status: 400 })
    }

    // 生成唯一的文件名
    const safeName = body.file_name.replace(/[/\\]/g, '_')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const objectKey = `resumes/original/${timestamp}_${randomStr}_${safeName}`
    
    // 如果配置了公共访问域名，直接使用它
    // 否则构建默认的R2域名
    const publicUrl = publicBase 
      ? `${publicBase.replace(/\/$/, '')}/${objectKey}`
      : `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`
    
    // 为了简化，我们直接返回公共URL
    // 前端可以直接PUT到这个URL（如果R2 bucket设置了公共写入权限）
    // 或者你可以在这里实现一个代理上传
    
    return new Response(JSON.stringify({ 
      url: publicUrl,  // 直接使用公共URL作为上传地址
      object_key: objectKey, 
      public_url: publicUrl 
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
    
  } catch (error: any) {
    console.error('Handler error:', error)
    return new Response(JSON.stringify({ 
      detail: 'Internal server error', 
      error: error?.message || 'Unknown error'
    }), { status: 500 })
  }
}