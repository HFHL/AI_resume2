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
    const limitParam = (searchParams.get('limit') || '200').toLowerCase()
    const unlimited = limitParam === 'all' || limitParam === '0' || limitParam === '-1'
    const limit = unlimited ? 1000000 : Math.min(parseInt(limitParam, 10) || 200, 1000000)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    const columns = 'id, resume_file_id, name, email, phone, skills, work_experience, internship_experience, project_experience, work_experience_struct, project_experience_struct, self_evaluation, education_degree, education_tiers, education_school, tag_names, work_years, created_at'

    async function fetchInBatches(baseQuery: any, startOffset: number, maxRows: number): Promise<any[]> {
      const batchSize = 1000
      const safetyMax = 500000
      let fetched: any[] = []
      let currentOffset = startOffset
      while (fetched.length < maxRows && fetched.length < safetyMax) {
        const remaining = Math.min(batchSize, maxRows - fetched.length)
        const from = currentOffset
        const to = currentOffset + remaining - 1
        const { data, error } = await baseQuery.range(from, to)
        if (error) throw new Error(error.message)
        const rows = Array.isArray(data) ? data : []
        fetched = fetched.concat(rows)
        if (rows.length < remaining) break
        currentOffset += rows.length
      }
      return fetched
    }

    if (q && q.trim()) {
      // 简单搜索：拉取部分数据后在函数内过滤
      const baseQuery = supabase
        .from('resumes')
        .select(columns)
        .order('id', { ascending: false })

      let data: any[] = []
      try {
        if (unlimited) {
          data = await fetchInBatches(baseQuery, 0, 1000000)
        } else {
          // 抓取比请求略多的数据，避免关键词过滤后不足
          data = await fetchInBatches(baseQuery, 0, Math.max(limit + offset, 5000))
        }
      } catch (e: any) {
        return new Response(JSON.stringify({ detail: e?.message || 'Query failed' }), { status: 400 })
      }
      // 多关键词AND逻辑搜索：分词后每个关键词都必须匹配
      // 解析查询：支持 "关键词 + 职位词" 语法
      const hasPlus = q.includes('+')
      const [leftPart, rightPart] = hasPlus ? q.split('+', 2).map(s => s.trim()) : [q.trim(), '']
      const generalKeywords = (leftPart || '').split(/\s+/).filter(Boolean).map(k => k.toLowerCase())
      const titleKeywords = (rightPart || '').split(/\s+/).filter(Boolean).map(k => k.toLowerCase())

      const makeBlob = (row: any) => {
        const parts: string[] = [row.name || '', row.email || '', row.phone || '', row.self_evaluation || '', row.education_degree || '']
        for (const key of ['skills','work_experience','internship_experience','project_experience']) {
          const vals = (row[key] || []) as string[]
          if (Array.isArray(vals)) parts.push(...vals.map(String))
        }
        return parts.join('\n').toLowerCase()
      }

      const cleanupTitle = (s: string) => {
        let t = String(s || '')
        t = t.replace(/[\t]+/g, ' ').replace(/\s+/g, ' ').trim()
        t = t.replace(/^(?:职位|岗位|职务)[:：]\s*/g, '')
        t = t.replace(/(负责|参与|主要|带领|领导|完成|进行).*/g, '')
        return t.trim()
      }

      const extractTitlesFromTextLine = (line: string): string[] => {
        const src = String(line || '')
        const titles: string[] = []
        const patterns: RegExp[] = [
          // 1) 日期-日期  公司  职位
          /^\s*\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?\s*[-~—–到至]\s*(?:\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?|至今|现在|Present)\s+.+?\s{2,}(.+?)\s*$/i,
          // 2) 公司：X 职位：Y
          /公司[:：]\s*.+?\s+(?:职位|岗位|职务)[:：]\s*([^\n]+)/i,
          // 3) 公司 | 职位  或  公司 / 职位  或  公司 · 职位
          /^\s*.+?\s*[|｜/·•]\s*([^\n]+)$/,
          // 4) 兜底：两段以上空格分隔的最后一段视为职位
          /^\s*.+?\s{2,}([^\n]+)$/,
        ]
        for (const re of patterns) {
          const m = src.match(re)
          if (m && m[1]) {
            titles.push(cleanupTitle(m[1]))
          }
        }
        return Array.from(new Set(titles.filter(Boolean)))
      }

      const getAllTitles = (row: any): string[] => {
        const acc: string[] = []
        const structs: any[] = Array.isArray(row.work_experience_struct) ? row.work_experience_struct : []
        for (const it of structs) {
          if (it && it.title) acc.push(cleanupTitle(it.title))
        }
        const lines: string[] = Array.isArray(row.work_experience) ? row.work_experience as any : []
        for (const ln of lines) acc.push(...extractTitlesFromTextLine(ln))
        return Array.from(new Set(acc.filter(Boolean)))
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
        const okGeneral = generalKeywords.length === 0 || generalKeywords.every(k => blob.includes(k))
        if (!okGeneral) return false
        if (titleKeywords.length === 0) return true
        const titles = getAllTitles(r).map(s => s.toLowerCase())
        if (titles.length === 0) return false
        // 至少有一个职位标题同时包含所有 title 关键词
        return titles.some(t => titleKeywords.every(k => t.includes(k)))
      })
      const total = matched.length
      const sliced = matched.slice(offset, offset + (unlimited ? total : limit))
      return new Response(JSON.stringify({ items: sliced, total }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    // 默认列表（包含 tag_names、skills、work_years、work_experience、email、phone）
    const base = supabase
      .from('resumes')
      .select('id, resume_file_id, name, email, phone, is_deleted, deleted_at, tag_names, skills, work_years, education_degree, education_tiers, education_school, created_at, work_experience, internship_experience, project_experience, work_experience_struct, project_experience_struct')
      .order('id', { ascending: false })
    let data: any[] = []
    try {
      // 默认排除软删除；支持 admin 查询覆盖
      const urlObj = new URL(typeof location !== 'undefined' ? location.href : 'http://localhost')
      const isAdmin = (urlObj.searchParams.get('admin') || '').toLowerCase() === 'true' || (urlObj.searchParams.get('x-admin') || '').toLowerCase() === 'true'
      const includeDeleted = (urlObj.searchParams.get('include_deleted') || '').toLowerCase() === 'true'
      const onlyDeleted = (urlObj.searchParams.get('only_deleted') || '').toLowerCase() === 'true'
      let baseQuery: any = base
      if (isAdmin) {
        if (onlyDeleted) baseQuery = baseQuery.eq('is_deleted', true)
        else if (!includeDeleted) baseQuery = baseQuery.eq('is_deleted', false)
      } else {
        baseQuery = baseQuery.eq('is_deleted', false)
      }
      if (unlimited) {
        data = await fetchInBatches(baseQuery, 0, 1000000)
      } else {
        const { data: pageData, error } = await baseQuery.range(offset, offset + limit - 1)
        if (error) throw new Error(error.message)
        data = Array.isArray(pageData) ? pageData : []
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ detail: e?.message || 'Query failed' }), { status: 400 })
    }
    
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


