import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const config = { 
  runtime: 'nodejs',
  api: {
    bodyParser: false
  }
}

// 解析multipart/form-data
async function parseFormData(req: Request): Promise<{ file: Buffer, fileName: string, contentType: string }> {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const fileName = formData.get('file_name') as string || file.name
  
  if (!file) {
    throw new Error('No file provided')
  }
  
  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    file: buffer,
    fileName,
    contentType: file.type || 'application/octet-stream'
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    
    // 获取环境变量
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET
    const publicBase = process.env.R2_PUBLIC_BASE_URL
    
    // 检查必需的环境变量
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return new Response(JSON.stringify({ 
        detail: 'R2 环境变量未配置完整'
      }), { status: 400 })
    }

    // 解析上传的文件
    const { file, fileName, contentType } = await parseFormData(req)
    
    // 初始化S3客户端（用于R2）
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    // 生成唯一的文件名
    const safeName = fileName.replace(/[/\\]/g, '_')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const objectKey = `resumes/original/${timestamp}_${randomStr}_${safeName}`
    
    // 上传到R2
    const uploadParams = {
      Bucket: bucket,
      Key: objectKey,
      Body: file,
      ContentType: contentType,
    }
    
    await s3Client.send(new PutObjectCommand(uploadParams))
    
    // 构建公共访问URL
    const publicUrl = publicBase 
      ? `${publicBase.replace(/\/$/, '')}/${objectKey}`
      : `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`
    
    return new Response(JSON.stringify({ 
      object_key: objectKey,
      public_url: publicUrl,
      file_name: fileName,
      size: file.length
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
    
  } catch (error: any) {
    console.error('Upload error:', error)
    return new Response(JSON.stringify({ 
      detail: error?.message || '上传失败'
    }), { status: 500 })
  }
}