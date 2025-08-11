import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  let query = supabase.from('tags').select('*').order('tag_name')
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
}


