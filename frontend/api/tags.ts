import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try {
    if (req.url.startsWith('http')) return new URL(req.url)
    return new URL(req.url, 'http://localhost')
  } catch {
    return new URL('http://localhost')
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = parseURL(req)
  const category = url.searchParams.get('category')
  let query = supabase.from('tags').select('*').order('tag_name')
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
}


