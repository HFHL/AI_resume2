import { createClient } from '@supabase/supabase-js'
export const config = { runtime: 'edge' }

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)

function parseIdFromUrl(urlStr: string): number | null {
  let url: URL
  try { url = new URL(urlStr) } catch { url = new URL(urlStr, 'http://localhost') }
  const parts = url.pathname.split('/').filter(Boolean)
  const idStr = parts[parts.length - 2] || parts[parts.length - 1]
  const id = Number(idStr)
  return Number.isFinite(id) && id > 0 ? id : null
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })
    const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
    if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可用' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    const id = parseIdFromUrl(req.url)
    if (!id) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // 读取该简历基本信息
    const { data: baseRows, error: baseErr } = await supabase
      .from('resumes')
      .select('id, name, email, phone, resume_file_id, is_deleted, is_dedup_hidden, canonical_id, created_at')
      .eq('id', id).limit(1)
    if (baseErr) return new Response(JSON.stringify({ detail: baseErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const self = (baseRows || [])[0]
    if (!self) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    // 文件名（规范化）
    let filenameNorm: string | null = null
    if (typeof self.resume_file_id === 'number' && self.resume_file_id > 0) {
      const { data: files } = await supabase.from('resume_files').select('id, file_name').eq('id', self.resume_file_id).limit(1)
      const fn = files && files[0]?.file_name
      if (fn) filenameNorm = String(fn).toLowerCase().replace(/\s+/g, ' ').trim()
    }

    // 构建四种分组候选
    const emailKey = (self.email || '').toString().trim().toLowerCase() || null
    const phoneKey = (self.phone || '').toString().trim() || null
    const nameKey = (self.name || '').toString().trim().toLowerCase() || null
    const nameContactKey = nameKey ? `${nameKey}|${emailKey || ''}|${phoneKey || ''}` : null

    async function queryBy(column: string, value: string) {
      const { data, error } = await supabase
        .from('resumes')
        .select('id, name, email, phone, resume_file_id, is_dedup_hidden, canonical_id, created_at')
        .eq(column as any, value)
        .eq('is_deleted', false)
      if (error) return []
      return (data || []) as any[]
    }

    async function queryByFilename(fnNorm: string) {
      const { data: files } = await supabase.from('resume_files').select('id, file_name')
      const norm = new Map<number, string>()
      for (const f of (files || [])) {
        const name = (f?.file_name ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim()
        if (!name) continue
        norm.set(f.id as number, name)
      }
      const { data: resumes } = await supabase.from('resumes').select('id, name, email, phone, resume_file_id, is_dedup_hidden, canonical_id, created_at').eq('is_deleted', false)
      const rows = (resumes || []).filter(r => typeof r.resume_file_id === 'number' && norm.get(r.resume_file_id) === fnNorm)
      return rows as any[]
    }

    const groups: Array<{ key: string; rule: string; rows: any[] }> = []
    if (emailKey) groups.push({ key: emailKey, rule: 'email', rows: await queryBy('email', emailKey) })
    if (phoneKey) groups.push({ key: phoneKey, rule: 'phone', rows: await queryBy('phone', phoneKey) })
    if (nameContactKey) {
      const { data: all } = await supabase.from('resumes').select('id, name, email, phone, resume_file_id, is_dedup_hidden, canonical_id, created_at').eq('is_deleted', false)
      const rows = (all || []).filter(r => ((r.name||'').toString().trim().toLowerCase() + '|' + ((r.email||'').toString().trim().toLowerCase()) + '|' + ((r.phone||'').toString().trim())) === nameContactKey)
      groups.push({ key: nameContactKey, rule: 'name_contact', rows: rows as any[] })
    }
    if (filenameNorm) groups.push({ key: filenameNorm, rule: 'filename', rows: await queryByFilename(filenameNorm) })

    // 去重并排序（每组按 id desc）
    const result = groups
      .map(g => ({
        key: g.key,
        rule: g.rule,
        count: (g.rows || []).length,
        ids: (g.rows || []).sort((a: any, b: any) => b.id - a.id).map((x: any) => x.id),
        rows: (g.rows || []).sort((a: any, b: any) => b.id - a.id)
      }))
      .filter(g => g.count >= 2)

    return new Response(JSON.stringify({ items: result }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: e?.message || 'Internal Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


