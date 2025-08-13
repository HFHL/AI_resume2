export const config = { 
  runtime: 'nodejs',
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    
    // 获取环境变量
    const publicBase = process.env.R2_PUBLIC_BASE_URL
    const bucket = process.env.R2_BUCKET
    
    if (!publicBase || !bucket) {
      return new Response(JSON.stringify({ 
        detail: 'R2_PUBLIC_BASE_URL 或 R2_BUCKET 未配置'
      }), { status: 400 })
    }

    // 从请求中获取文件数据
    const formData = await req.formData()
    const file = formData.get('file') as File
    const fileName = formData.get('file_name') as string
    
    if (!file || !fileName) {
      return new Response(JSON.stringify({ 
        detail: '缺少文件或文件名' 
      }), { status: 400 })
    }

    // 生成唯一的文件名
    const safeName = fileName.replace(/[/\\]/g, '_')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const objectKey = `resumes/original/${timestamp}_${randomStr}_${safeName}`
    
    // 构建公共访问URL
    const publicUrl = `${publicBase.replace(/\/$/, '')}/${objectKey}`
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // 直接上传到R2（使用fetch）
    const uploadUrl = publicUrl
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: buffer,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      }
    })
    
    if (!uploadResponse.ok) {
      throw new Error(`上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`)
    }
    
    return new Response(JSON.stringify({ 
      object_key: objectKey,
      public_url: publicUrl,
      file_name: fileName,
      size: file.size
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