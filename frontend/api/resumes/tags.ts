import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  // 无鉴权，直接查询
  const { data, error } = await supabase
    .from('resumes')
    .select('id, tag_names')
    .order('id', { ascending: false })

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
}


