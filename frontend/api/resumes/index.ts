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
  const limitParam = (url.searchParams.get('limit') || '200').toLowerCase()
  const unlimited = limitParam === 'all' || limitParam === '0' || limitParam === '-1'
  const limit = unlimited ? 1000000 : Math.min(parseInt(limitParam, 10) || 200, 1000000)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

  // 权限检查
  const _isAdmin = (url.searchParams.get('admin') || '').toLowerCase() === 'true' || (url.searchParams.get('x-admin') || '').toLowerCase() === 'true'
  const _includeDeleted = (url.searchParams.get('include_deleted') || '').toLowerCase() === 'true'
  const _onlyDeleted = (url.searchParams.get('only_deleted') || '').toLowerCase() === 'true'
  const _includeHidden = (url.searchParams.get('include_hidden') || '').toLowerCase() === 'true'
  const _onlyHidden = (url.searchParams.get('only_hidden') || '').toLowerCase() === 'true'

  let query = supabase
    .from('resumes')
    .select('id, resume_file_id, name, email, phone, is_deleted, deleted_at, is_dedup_hidden, canonical_id, skills, tag_names, work_years, education_degree, education_tiers, education_school, created_at, work_experience, internship_experience, project_experience, work_experience_struct, project_experience_struct')
    .order('id', { ascending: false })

  // 软删除过滤：默认排除；管理员可通过参数控制
  if (_isAdmin) {
    if (_onlyDeleted) {
      query = query.eq('is_deleted', true)
    } else if (!_includeDeleted) {
      query = query.eq('is_deleted', false)
    }
    
    // 去重隐藏过滤：管理员可通过参数控制
    if (_onlyHidden) {
      query = query.eq('is_dedup_hidden', true)
    } else if (!_includeHidden) {
      query = query.eq('is_dedup_hidden', false)
    }
  } else {
    // 非管理员：默认排除已删除和已隐藏的记录
    query = query.eq('is_deleted', false).eq('is_dedup_hidden', false)
  }

  // 如果有搜索词，进行模糊搜索
  if (searchQuery) {
    // 使用 Supabase 的 ilike 进行多字段搜索
    query = query.or(
      `name.ilike.%${searchQuery}%,` +
      `email.ilike.%${searchQuery}%,` +
      `phone.ilike.%${searchQuery}%,` +
      `skills.cs.{${searchQuery}},` +
      `work_experience.cs.{${searchQuery}},` +
      `internship_experience.cs.{${searchQuery}},` +
      `project_experience.cs.{${searchQuery}},` +
      `self_evaluation.ilike.%${searchQuery}%`
    )
  }

  let data: any[] = []
  try {
    if (unlimited) {
      // 批量抓取，避免 1000 条默认限制
      const batchSize = 1000
      const safetyMax = 500000
      let fetched: any[] = []
      let currentOffset = offset
      while (fetched.length < limit && fetched.length < safetyMax) {
        const remaining = Math.min(batchSize, limit - fetched.length)
        const from = currentOffset
        const to = currentOffset + remaining - 1
        const { data: chunk, error } = await query.range(from, to)
        if (error) throw new Error(error.message)
        const rows = Array.isArray(chunk) ? chunk : []
        fetched = fetched.concat(rows)
        if (rows.length < remaining) break
        currentOffset += rows.length
      }
      data = fetched
    } else {
      const { data: pageData, error } = await query.range(offset, offset + limit - 1)
      if (error) throw new Error(error.message)
      data = Array.isArray(pageData) ? pageData : []
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Query failed' }), { status: 400 })
  }

  // 过滤逻辑已在查询构建时应用，此处无需重复处理

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
      if ((r as any).email) parts.push(String((r as any).email))
      if ((r as any).phone) parts.push(String((r as any).phone))
      if (r.self_evaluation) parts.push(String(r.self_evaluation))
      for (const key of ['skills','work_experience','internship_experience','project_experience'] as const) {
        const arr = (r as any)[key]
        if (Array.isArray(arr)) parts.push(...arr.map((x: any) => String(x)))
      }
      return parts.join('\n').toLowerCase().includes(q)
    })
  }

  // 合并 uploaded_by（通过 resume_file_id 关联 resume_files 表）
  try {
    const rfIds = Array.from(new Set((items || []).map((r: any) => r.resume_file_id).filter((x: any) => typeof x === 'number' && x > 0))) as number[]
    if (rfIds.length > 0) {
      const { data: files, error: fileErr } = await supabase
        .from('resume_files')
        .select('id, uploaded_by')
        .in('id', rfIds)
      if (!fileErr && Array.isArray(files)) {
        const idToUploader = new Map<number, string>()
        for (const f of files) {
          if (f && typeof f.id === 'number') {
            idToUploader.set(f.id, (f as any).uploaded_by || '')
          }
        }
        items = (items || []).map((r: any) => ({
          ...r,
          uploaded_by: r.resume_file_id ? (idToUploader.get(r.resume_file_id) || null) : null,
        }))
      }
    }
  } catch {
    // 忽略 uploaded_by 合并失败，不影响主流程
  }

  return new Response(JSON.stringify({ items, _meta: { source: 'edge:resumes-index', version: 3 } }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
