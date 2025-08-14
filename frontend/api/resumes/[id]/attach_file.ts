import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs' }

function parseURL(req: Request) {
  try {
    if (req.url.startsWith('http')) return new URL(req.url)
    return new URL(req.url, 'http://localhost')
  } catch {
    return new URL('http://localhost')
  }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const url = parseURL(req)
  const idStr = ctx?.params?.id || url.pathname.split('/').filter(Boolean).slice(-2, -1)[0]
  const resumeId = Number(idStr)
  if (!resumeId) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400 })

  const body = (await req.json().catch(() => null)) as { path?: string; file_name?: string; uploaded_by?: string } | null
  if (!body || !body.path || !body.file_name) {
    return new Response(JSON.stringify({ detail: 'path and file_name required' }), { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL as string | undefined
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
  const bucket = process.env.SUPABASE_STORAGE_BUCKET as string | undefined
  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    return new Response(
      JSON.stringify({ detail: 'Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY), SUPABASE_STORAGE_BUCKET' }),
      { status: 400 }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 生成可访问的 publicUrl（要求该 bucket 为 public）
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(body.path)
  const publicUrl = pub?.publicUrl
  if (!publicUrl) {
    return new Response(
      JSON.stringify({ detail: 'Storage 桶必须为 public 才能生成可访问的 URL。请将该桶设为 public 后重试。' }),
      { status: 400 }
    )
  }

  // 读取当前简历，检查是否已有 resume_file_id
  const { data: rlist, error: rerr } = await supabase
    .from('resumes')
    .select('id, resume_file_id')
    .eq('id', resumeId)
    .limit(1)

  if (rerr) return new Response(JSON.stringify({ detail: rerr.message }), { status: 400 })
  const resume = (rlist || [])[0] as { id: number; resume_file_id: number | null } | undefined
  if (!resume) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404 })

  const uploadedBy = (body.uploaded_by && String(body.uploaded_by)) || 'web'

  let fileRow: any
  if (resume.resume_file_id) {
    // 更新已有的 resume_files 记录
    const { data: updated, error: uerr } = await supabase
      .from('resume_files')
      .update({ file_name: body.file_name, file_path: publicUrl, uploaded_by: uploadedBy, status: '已上传' })
      .eq('id', resume.resume_file_id)
      .select('*')
      .limit(1)
    if (uerr) return new Response(JSON.stringify({ detail: uerr.message }), { status: 500 })
    fileRow = (updated || [])[0]
  } else {
    // 新增 resume_files，并回填到 resumes.resume_file_id
    const { data: inserted, error: ierr } = await supabase
      .from('resume_files')
      .insert({ file_name: body.file_name, file_path: publicUrl, uploaded_by: uploadedBy, status: '已上传' })
      .select('*')
      .limit(1)
    if (ierr) return new Response(JSON.stringify({ detail: ierr.message }), { status: 500 })
    fileRow = (inserted || [])[0]
    const { error: rupdateErr } = await supabase
      .from('resumes')
      .update({ resume_file_id: fileRow.id })
      .eq('id', resumeId)
    if (rupdateErr) return new Response(JSON.stringify({ detail: rupdateErr.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ item: { resume_id: resumeId, resume_file_id: resume.resume_file_id || fileRow.id, file: fileRow, file_url: publicUrl } }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}


