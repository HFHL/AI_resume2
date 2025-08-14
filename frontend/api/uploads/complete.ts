export const config = { runtime: 'nodejs' }
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const body = (await req.json().catch(() => null)) as { file_name?: string; path?: string; uploaded_by?: string } | null
  if (!body || !body.file_name || !body.path || !body.uploaded_by) {
    return new Response(JSON.stringify({ detail: 'file_name, path, uploaded_by required' }), { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL as string | undefined
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  const bucket = process.env.SUPABASE_STORAGE_BUCKET as string | undefined
  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    return new Response(JSON.stringify({ detail: 'Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY), SUPABASE_STORAGE_BUCKET' }), { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 若桶为 public，生成长期可用的 publicUrl；否则可只存 path
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(body.path)
  const publicUrl = pub?.publicUrl
  if (!publicUrl) {
    return new Response(
      JSON.stringify({ detail: 'Storage 桶必须为 public 才能生成可访问的 URL。请将该桶设为 public 后重试。' }),
      { status: 400 }
    )
  }

  const row = {
    file_name: body.file_name,
    uploaded_by: body.uploaded_by,
    file_path: publicUrl,
    status: '已上传',
    parse_status: 'pending',
  }
  const { data, error } = await supabase.from('resume_files').insert(row).select('*').limit(1)
  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 500 })
  return new Response(JSON.stringify({ item: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
}

