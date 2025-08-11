import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

export default async function handler(): Promise<Response> {
  const { data, error } = await supabase
    .from('positions')
    .select('id, position_name, position_category, tags, match_type, created_at')
    .order('id', { ascending: false })

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
}
