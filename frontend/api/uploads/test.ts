export const config = { runtime: 'edge' }
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const fileName = (form.get('file_name') as string | null) || (file?.name ?? null)
    const uploadedBy = (form.get('uploaded_by') as string | null) || 'web'
    if (!file || !fileName) {
      return new Response(JSON.stringify({ detail: 'file 和 file_name 必填' }), { status: 400 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    const bucket = process.env.SUPABASE_STORAGE_BUCKET
    if (!supabaseUrl || !serviceRoleKey || !bucket) {
      return new Response(
        JSON.stringify({ detail: '缺少环境变量: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(or SUPABASE_KEY), SUPABASE_STORAGE_BUCKET' }),
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 规范化文件名，去除可能导致存储键非法的字符，并避免与桶名重复的前缀
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const dot = fileName.lastIndexOf('.')
    const rawName = dot > 0 ? fileName.slice(0, dot) : fileName
    const ext = dot > 0 ? fileName.slice(dot + 1) : ''
    const sanitizedBase = rawName
      .normalize('NFKD')
      .replace(/[\s]+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100) || 'file'
    const sanitizedExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin'
    const safeName = `${sanitizedBase}.${sanitizedExt}`
    const path = `original/${ts}_${rand}_${safeName}`

    const contentType = (file as any).type || 'application/octet-stream'

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: false })
    if (upErr) {
      return new Response(JSON.stringify({ detail: `存储上传失败: ${upErr.message}` }), { status: 500 })
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) {
      return new Response(
        JSON.stringify({ detail: 'Storage 桶必须为 public 才能生成可访问的 URL。请将该桶设为 public 后重试。' }),
        { status: 400 }
      )
    }

    const row = {
      file_name: fileName,
      uploaded_by: uploadedBy,
      file_path: publicUrl,
    status: '已上传',
    }
    const { error: dbErr } = await supabase.from('resume_files').insert(row)
    if (dbErr) {
      return new Response(JSON.stringify({ detail: `数据库写入失败: ${dbErr.message}` }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true, public_url: publicUrl, path }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(
      JSON.stringify({ detail: '服务器错误', error: e?.message || String(e) }),
      { status: 500 }
    )
  }
}