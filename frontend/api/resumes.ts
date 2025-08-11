import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try {
    if (req.url.startsWith('http')) return new URL(req.url)
    // Fallback base for relative URL in serverless runtime
    return new URL(req.url, 'http://localhost')
  } catch {
    return new URL('http://localhost')
  }
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = parseURL(req)
  const method = req.method

  if (method === 'GET') {
    const q = searchParams.get('q')
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    if (q && q.trim()) {
      // 简单搜索：拉取部分数据后在函数内过滤
      const { data, error } = await supabase
        .from('resumes')
        .select('id, name, contact_info, skills, work_experience, internship_experience, project_experience, self_evaluation, education_degree, education_tiers, created_at')
        .order('id', { ascending: false })
        .limit(5000)
      if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
      const needle = q.toLowerCase()
      const makeBlob = (row: any) => {
        const parts: string[] = [row.name || '', row.contact_info || '', row.self_evaluation || '', row.education_degree || '']
        for (const key of ['skills','work_experience','internship_experience','project_experience']) {
          const vals = (row[key] || []) as string[]
          if (Array.isArray(vals)) parts.push(...vals.map(String))
        }
        return parts.join('\n').toLowerCase()
      }
      const matched = (data || []).filter(r => makeBlob(r).includes(needle))
      const total = matched.length
      const sliced = matched.slice(offset, offset + limit)
      return new Response(JSON.stringify({ items: sliced, total }), { headers: { 'Content-Type': 'application/json' } })
    }

    // 默认列表
    const { data, error } = await supabase
      .from('resumes')
      .select('id, name, skills, education_degree, education_tiers, created_at')
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    return new Response(JSON.stringify({ items: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}


