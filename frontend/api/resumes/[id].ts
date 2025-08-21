import { createClient } from '@supabase/supabase-js'
// 已移除鉴权
export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  // GET：无鉴权，直接查询
  const url = parseURL(req)
  const idStr = ctx?.params?.id || url.pathname.split('/').filter(Boolean).pop()
  const id = Number(idStr)
  if (!id) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400 })

  if (req.method === 'DELETE') {
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可删除简历' }), { status: 403 })

    const { data, error } = await supabase
      .from('resumes')
      .delete()
      .eq('id', id)
      .select('*')
      .limit(1)

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    const deleted = (data || [])[0]
    if (!deleted) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, deleted }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .limit(1)

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  const item = (data || [])[0] as any
  if (!item) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404 })

  // 关联查询文件直链（若存在 resume_file_id）
  if (item.resume_file_id) {
    const { data: fileRow, error: fileErr } = await supabase
      .from('resume_files')
      .select('file_path')
      .eq('id', item.resume_file_id as number)
      .maybeSingle()

    if (!fileErr && fileRow && (fileRow as any).file_path) {
      item.file_url = (fileRow as any).file_path
    }
  }

  return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
}
