import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function getCategory(url: URL): string | null {
  const c = url.searchParams.get('category')
  return c && c.trim() ? c : null
}

export default async function handler(req: Request): Promise<Response> {
  let url: URL
  try { url = new URL(req.url) } catch { url = new URL(req.url, 'http://localhost') }
  const category = getCategory(url)
  if (!category) return new Response(JSON.stringify({ detail: 'category required' }), { status: 400 })

  const { data, error } = await supabase.from('tags').select('*').eq('category', category).order('tag_name')
  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
}
