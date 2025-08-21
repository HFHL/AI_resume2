import { createClient } from '@supabase/supabase-js'
// 已移除鉴权
export const config = { runtime: 'nodejs' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseURL(req: Request) {
  try { return new URL(req.url) } catch { return new URL(req.url, 'http://localhost') }
}

export default async function handler(req: Request): Promise<Response> {
  // 无鉴权，直接查询
  const url = parseURL(req)
  const searchQuery = url.searchParams.get('q')?.trim()

  let query = supabase
    .from('resumes')
    .select('id, name, skills, tag_names, work_years, education_degree, education_tiers, education_school, created_at, work_experience, internship_experience, project_experience')
    .order('id', { ascending: false })

  // 如果有搜索词，进行模糊搜索
  if (searchQuery) {
    // 使用 Supabase 的 ilike 进行多字段搜索
    query = query.or(
      `name.ilike.%${searchQuery}%,` +
      `contact_info.ilike.%${searchQuery}%,` +
      `skills.cs.{${searchQuery}},` +
      `tag_names.cs.{${searchQuery}},` +
      `work_experience.cs.{${searchQuery}},` +
      `internship_experience.cs.{${searchQuery}},` +
      `project_experience.cs.{${searchQuery}},` +
      `self_evaluation.ilike.%${searchQuery}%`
    )
  }

  const { data, error } = await query

  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })

  let items = (data || []).map((r: any) => {
    const work = Array.isArray(r.work_experience) ? r.work_experience : []
    if (work.length > 0) return r
    const intern = Array.isArray(r.internship_experience) ? r.internship_experience : []
    const proj = Array.isArray(r.project_experience) ? r.project_experience : []
    const merged = [...intern, ...proj].filter(Boolean)
    return { ...r, work_experience: merged }
  })
  
  // 额外的后置过滤：支持数组字段的"包含子串"匹配（如 tag_names/skills 中的模糊匹配）
  if (searchQuery && items.length) {
    const q = searchQuery.toLowerCase()
    items = items.filter((r: any) => {
      const parts: string[] = []
      if (r.name) parts.push(String(r.name))
      if (r.contact_info) parts.push(String(r.contact_info))
      if (r.self_evaluation) parts.push(String(r.self_evaluation))
      for (const key of ['skills','tag_names','work_experience','internship_experience','project_experience'] as const) {
        const arr = (r as any)[key]
        if (Array.isArray(arr)) parts.push(...arr.map((x: any) => String(x)))
      }
      return parts.join('\n').toLowerCase().includes(q)
    })
  }

  return new Response(JSON.stringify({ items, _meta: { source: 'edge:resumes-index', version: 3 } }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
