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

type PositionRow = {
  id: number
  position_name: string
  position_category: string | null
  required_keywords: string[] | null
  match_type: 'any' | 'all' | null
  tags: string[] | null
}

type ResumeRow = {
  id: number
  name: string | null
  contact_info: string | null
  skills: string[] | null
  work_experience: string[] | null
  internship_experience: string[] | null
  project_experience: string[] | null
  self_evaluation: string | null
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const url = parseURL(req)
  const idStr = ctx?.params?.id || url.pathname.split('/').filter(Boolean).slice(-2, -1)[0]
  const resumeId = Number(idStr)
  if (!resumeId) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400 })

  // 读取简历
  const { data: rlist, error: rerr } = await supabase
    .from('resumes')
    .select('id, name, contact_info, skills, work_experience, internship_experience, project_experience, self_evaluation')
    .eq('id', resumeId)
    .limit(1)
  if (rerr) return new Response(JSON.stringify({ detail: rerr.message }), { status: 400 })
  const resume = (rlist || [])[0] as ResumeRow | undefined
  if (!resume) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404 })

  // 读取职位列表
  const { data: plist, error: perr } = await supabase
    .from('positions')
    .select('id, position_name, position_category, required_keywords, match_type, tags')
  if (perr) return new Response(JSON.stringify({ detail: perr.message }), { status: 400 })

  // 将简历内容拼接为文本块
  const parts: string[] = [resume.name || '', resume.contact_info || '', resume.self_evaluation || '']
  for (const key of ['skills','work_experience','internship_experience','project_experience'] as const) {
    const vals = (resume as any)[key] || []
    if (Array.isArray(vals)) parts.push(...vals.map(String))
  }
  const blob = parts.join('\n').toLowerCase()

  // 逐个职位计算匹配情况（与职位->简历的匹配逻辑一致）
  const items = (plist || []).map((p: PositionRow) => {
    const required = (p.required_keywords || []).map(k => (k || '').toLowerCase()).filter(Boolean)
    const matchType = (p.match_type || 'any') as 'any' | 'all'
    const matched = required.filter(k => blob.includes(k))
    const hit = matched.length
    const ok = required.length === 0 ? false : (matchType === 'all' ? hit === required.length : hit > 0)
    if (!ok) return null
    return {
      id: p.id,
      position_name: p.position_name,
      position_category: p.position_category,
      tags: p.tags || [],
      match_type: matchType,
      matched_keywords: matched,
      hit_count: hit,
      score: hit * 10,
    }
  }).filter(Boolean) as any[]

  items.sort((a, b) => (b.score - a.score) || (b.hit_count - a.hit_count) || (b.id - a.id))

  return new Response(
    JSON.stringify({ items, total: items.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}


