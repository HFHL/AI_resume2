import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

    const userAccount = (req.headers.get('x-user') || '').trim()
    if (!userAccount) return new Response(JSON.stringify({ detail: 'x-user required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const { searchParams } = parseURL(req)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const { data: files, error } = await supabase
      .from('resume_files')
      .select('id, file_name, file_path, status, uploaded_by, created_at')
      .eq('uploaded_by', userAccount)
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const rfIds = Array.from(new Set((files || []).map((f: any) => f.id))) as number[]
    let idMap = new Map<number, number>()
    if (rfIds.length) {
      const { data: resumes } = await supabase
        .from('resumes')
        .select('id, resume_file_id')
        .in('resume_file_id', rfIds)
      for (const r of (resumes || []) as any[]) {
        if (typeof r.resume_file_id === 'number') idMap.set(r.resume_file_id, r.id)
      }
    }

    const items = (files || []).map((f: any) => ({
      id: f.id,
      file_name: f.file_name,
      file_path: f.file_path,
      status: f.status,
      uploaded_by: f.uploaded_by,
      created_at: f.created_at,
      resume_id: idMap.get(f.id) || null,
    }))
    return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


