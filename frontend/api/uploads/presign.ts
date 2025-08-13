import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const body = await req.json().catch(() => null) as { file_name?: string, content_type?: string } | null
  if (!body || !body.file_name) return new Response(JSON.stringify({ detail: 'file_name required' }), { status: 400 })

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicBase = process.env.R2_PUBLIC_BASE_URL
  
  const missingVars = []
  if (!accountId) missingVars.push('R2_ACCOUNT_ID')
  if (!accessKeyId) missingVars.push('R2_ACCESS_KEY_ID')
  if (!secretAccessKey) missingVars.push('R2_SECRET_ACCESS_KEY')
  if (!bucket) missingVars.push('R2_BUCKET')
  
  if (missingVars.length > 0) {
    return new Response(JSON.stringify({ detail: `R2 环境变量未配置: ${missingVars.join(', ')}` }), { status: 400 })
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  const safeName = body.file_name.replace(/[/\\]/g, '_')
  const uniq = `${Date.now()}_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2, 10))}`
  const objectKey = `resumes/original/${uniq}_${safeName}`

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: body.content_type || 'application/octet-stream',
  })
  try {
    const url = await getSignedUrl(s3, cmd, { expiresIn: 600 })
    const publicUrl = buildPublicUrl(objectKey, publicBase, bucket, accountId)
    return new Response(JSON.stringify({ url, object_key: objectKey, public_url: publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || '生成预签名URL失败' }), { status: 500 })
  }
}

function buildPublicUrl(objectKey: string, base?: string, bucket?: string, accountId?: string): string {
  objectKey = objectKey.replace(/^\/+/, '')
  if (base && base.trim()) return `${base.replace(/\/$/, '')}/${objectKey}`
  if (!bucket || !accountId) return objectKey
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`
}


