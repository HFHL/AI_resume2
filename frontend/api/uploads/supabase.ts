import { createClient } from '@supabase/supabase-js'

export const config = { 
  runtime: 'nodejs'
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    
    // 获取Supabase配置
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ 
        detail: 'Supabase 环境变量未配置'
      }), { status: 400 })
    }

    // 解析上传的文件
    const formData = await req.formData()
    const file = formData.get('file') as File
    const fileName = formData.get('file_name') as string || file.name
    
    if (!file) {
      return new Response(JSON.stringify({ 
        detail: '没有文件'
      }), { status: 400 })
    }

    // 初始化Supabase客户端
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // 生成唯一的文件名
    const safeName = fileName.replace(/[/\\]/g, '_')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const filePath = `resumes/original/${timestamp}_${randomStr}_${safeName}`
    
    // 上传到Supabase Storage
    const { data, error } = await supabase.storage
      .from('resumes') // 需要在Supabase中创建这个bucket
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      })
    
    if (error) {
      throw error
    }
    
    // 获取公共URL
    const { data: { publicUrl } } = supabase.storage
      .from('resumes')
      .getPublicUrl(filePath)
    
    return new Response(JSON.stringify({ 
      file_path: filePath,
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