import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const url = parseURL(req)
  const idStr = ctx?.params?.id || url.pathname.split('/').filter(Boolean).pop()
  const id = Number(idStr)
  if (!id) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400 })

  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .limit(1)

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
  const item = (data || [])[0]
  if (!item) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404 })
  return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
}
