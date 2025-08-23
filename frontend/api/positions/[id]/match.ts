/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

type ResumeRow = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  skills: string[] | null
  work_experience: string[] | null
  internship_experience: string[] | null
  project_experience: string[] | null
  self_evaluation: string | null
  education_degree: string | null
  education_tiers: string[] | null
  education_school: string[] | null
  tag_names: string[] | null
  work_years: number | null
  created_at: string | null
}

function parseURL(req: Request) {
  try {
    if (req.url.startsWith('http')) return new URL(req.url)
    return new URL(req.url, 'http://localhost')
  } catch {
    return new URL('http://localhost')
  }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const url = parseURL(req)
  const id = ctx?.params?.id || url.pathname.split('/').filter(Boolean).slice(-2, -1)[0]
  if (!id) return new Response(JSON.stringify({ detail: 'position id required' }), { status: 400 })

  // 读取职位
  const { data: posList, error: posErr } = await supabase
    .from('positions')
    .select('*')
    .eq('id', Number(id))
    .limit(1)
  if (posErr) return new Response(JSON.stringify({ detail: posErr.message }), { status: 400 })
  const position = (posList || [])[0]
  if (!position) return new Response(JSON.stringify({ detail: '职位不存在' }), { status: 404 })

  // 拉取简历
  const { data: resumes, error: rErr } = await supabase
    .from('resumes')
    .select('id, resume_file_id, name, email, phone, skills, work_experience, internship_experience, project_experience, self_evaluation, education_degree, education_tiers, education_school, tag_names, work_years, created_at')
  if (rErr) return new Response(JSON.stringify({ detail: rErr.message }), { status: 400 })

  const required: string[] = position.required_keywords || []
  const matchType: 'any' | 'all' = position.match_type || 'any'

  const results = (resumes || []).map((resume: ResumeRow) => {
    const parts: string[] = [resume.name || '', (resume as any).email || '', (resume as any).phone || '', resume.self_evaluation || '']
    for (const key of ['skills','work_experience','internship_experience','project_experience'] as const) {
      const vals = (resume as any)[key] || []
      if (Array.isArray(vals)) parts.push(...vals.map(String))
    }
    const blob = parts.join('\n').toLowerCase()
    const matched = required.filter(k => (k || '').toLowerCase() && blob.includes((k || '').toLowerCase()))
    const hit = matched.length
    const ok = matchType === 'all' ? hit === required.length : hit > 0
    if (!ok) return null

    // 合并工作经历（与 /api/resumes 的逻辑保持一致：若 work_experience 为空，则合并实习与项目经验）
    const work = Array.isArray(resume.work_experience) ? resume.work_experience : []
    const workMerged = work.length > 0
      ? work
      : [
          ...(Array.isArray(resume.internship_experience) ? resume.internship_experience : []),
          ...(Array.isArray(resume.project_experience) ? resume.project_experience : []),
        ].filter(Boolean)

    return {
      id: resume.id,
      name: resume.name || '未知',
      education_degree: resume.education_degree || null,
      education_tiers: resume.education_tiers || [],
      education_school: resume.education_school || [],
      skills: resume.skills || [],
      matched_keywords: matched,
      hit_count: hit,
      score: hit * 10,
      tag_names: resume.tag_names || [],
      work_years: resume.work_years ?? null,
      created_at: resume.created_at ?? null,
      work_experience: workMerged,
    }
  }).filter(Boolean) as any[]

  // 合并 uploaded_by（批量查询 resume_files）
  try {
    const rfIds = Array.from(new Set(results.map((r: any) => (resumes as any[]).find(x => x.id === r.id)?.resume_file_id).filter((x: any) => typeof x === 'number' && x > 0))) as number[]
    if (rfIds.length > 0) {
      const { data: files } = await supabase
        .from('resume_files')
        .select('id, uploaded_by')
        .in('id', rfIds)
      const idToUploader = new Map<number, string>()
      for (const f of (files || []) as any[]) {
        if (f && typeof f.id === 'number') idToUploader.set(f.id, f.uploaded_by || '')
      }
      const idToRF = new Map<number, number>()
      for (const r of (resumes || []) as any[]) {
        if (typeof r.id === 'number' && typeof r.resume_file_id === 'number') idToRF.set(r.id, r.resume_file_id)
      }
      for (const r of results as any[]) {
        const fid = idToRF.get(r.id)
        r.uploaded_by = fid ? (idToUploader.get(fid) || null) : null
      }
    }
  } catch {}

  results.sort((a, b) => (b.score - a.score) || (b.hit_count - a.hit_count) || (b.id - a.id))

  return new Response(JSON.stringify({ items: results, total: results.length }), { headers: { 'Content-Type': 'application/json' } })
}


