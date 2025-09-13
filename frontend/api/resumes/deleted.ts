import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) {
      return new Response(JSON.stringify({ detail: '仅管理员可查看' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    // 返回所有软删除记录
    const { data, error } = await supabase
      .from('resumes')
      .select('id, name, deleted_at')
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false })

    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


