import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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
    if (!accessKeyId) missingVars.push('R2_ACCESS_KEY_ID')
    if (!secretAccessKey) missingVars.push('R2_SECRET_ACCESS_KEY')
    if (!bucket) missingVars.push('R2_BUCKET')
    
    if (missingVars.length > 0) {
      return new Response(JSON.stringify({ 
        detail: `R2 环境变量未配置: ${missingVars.join(', ')}`,
        missing: missingVars 
      }), { status: 400 })
    }

    // 初始化S3客户端（用于R2）
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    })

    // 生成唯一的文件名
    const safeName = body.file_name.replace(/[/\\]/g, '_')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const objectKey = `resumes/original/${timestamp}_${randomStr}_${safeName}`
    
    // 创建PutObjectCommand
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: body.content_type || 'application/octet-stream',
    })

    // 生成预签名URL，有效期10分钟
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 })
    
    // 构建公共访问URL
    const publicUrl = publicBase 
      ? `${publicBase.replace(/\/$/, '')}/${objectKey}`
      : `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`
    
    return new Response(JSON.stringify({ 
      url: presignedUrl,
      object_key: objectKey, 
      public_url: publicUrl 
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
    
  } catch (error: any) {
    console.error('Handler error:', error)
    return new Response(JSON.stringify({ 
      detail: 'Internal server error', 
      error: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }), { status: 500 })
  }
}