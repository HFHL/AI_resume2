import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

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
        .select('id, resume_file_id, name, email, phone, skills, work_experience, internship_experience, project_experience, self_evaluation, education_degree, education_tiers, education_school, tag_names, work_years, created_at')
        .order('id', { ascending: false })
        .limit(5000)
      if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
      // 多关键词AND逻辑搜索：分词后每个关键词都必须匹配
      const keywords = q.trim().split(/\s+/).filter(Boolean).map(k => k.toLowerCase())
      const makeBlob = (row: any) => {
        const parts: string[] = [row.name || '', row.email || '', row.phone || '', row.self_evaluation || '', row.education_degree || '']
        for (const key of ['skills','work_experience','internship_experience','project_experience','tag_names']) {
          const vals = (row[key] || []) as string[]
          if (Array.isArray(vals)) parts.push(...vals.map(String))
        }
        return parts.join('\n').toLowerCase()
      }
      // 对搜索结果也进行工作经历合并处理
      const processedSearchData = (data || []).map((r: any) => {
        const work = Array.isArray(r.work_experience) ? r.work_experience : []
        if (work.length > 0) return r
        
        const intern = Array.isArray(r.internship_experience) ? r.internship_experience : []
        const proj = Array.isArray(r.project_experience) ? r.project_experience : []
        const merged = [...intern, ...proj].filter(Boolean)
        
        return { ...r, work_experience: merged }
      })
      // 合并 uploaded_by
      try {
        const rfIds = Array.from(new Set(processedSearchData.map((r: any) => r.resume_file_id).filter((x: any) => typeof x === 'number' && x > 0))) as number[]
        if (rfIds.length > 0) {
          const { data: files } = await supabase
            .from('resume_files')
            .select('id, uploaded_by')
            .in('id', rfIds)
          const idToUploader = new Map<number, string>()
          for (const f of (files || []) as any[]) {
            if (f && typeof f.id === 'number') idToUploader.set(f.id, f.uploaded_by || '')
          }
          for (const r of processedSearchData as any[]) {
            r.uploaded_by = r.resume_file_id ? (idToUploader.get(r.resume_file_id) || null) : null
          }
        }
      } catch {}
      
      // AND逻辑：所有关键词都必须在简历内容中出现
      const matched = processedSearchData.filter(r => {
        const blob = makeBlob(r)
        return keywords.every(keyword => blob.includes(keyword))
      })
      const total = matched.length
      const sliced = matched.slice(offset, offset + limit)
      return new Response(JSON.stringify({ items: sliced, total }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    // 默认列表（包含 tag_names、skills、work_years、work_experience）
    const { data, error } = await supabase
      .from('resumes')
      .select('id, resume_file_id, name, tag_names, skills, work_years, education_degree, education_tiers, education_school, created_at, work_experience, internship_experience, project_experience')
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 400 })
    
    // 对于 work_experience 为空的记录，尝试合并 internship_experience 和 project_experience
    const processedData = (data || []).map((r: any) => {
      const work = Array.isArray(r.work_experience) ? r.work_experience : []
      if (work.length > 0) return r
      
      const intern = Array.isArray(r.internship_experience) ? r.internship_experience : []
      const proj = Array.isArray(r.project_experience) ? r.project_experience : []
      const merged = [...intern, ...proj].filter(Boolean)
      
      return { ...r, work_experience: merged }
    })
    // 合并 uploaded_by
    try {
      const rfIds = Array.from(new Set(processedData.map((r: any) => r.resume_file_id).filter((x: any) => typeof x === 'number' && x > 0))) as number[]
      if (rfIds.length > 0) {
        const { data: files } = await supabase
          .from('resume_files')
          .select('id, uploaded_by')
          .in('id', rfIds)
        const idToUploader = new Map<number, string>()
        for (const f of (files || []) as any[]) {
          if (f && typeof f.id === 'number') idToUploader.set(f.id, f.uploaded_by || '')
        }
        for (const r of processedData as any[]) {
          r.uploaded_by = r.resume_file_id ? (idToUploader.get(r.resume_file_id) || null) : null
        }
      }
    } catch {}
    
    return new Response(JSON.stringify({ items: processedData }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}


