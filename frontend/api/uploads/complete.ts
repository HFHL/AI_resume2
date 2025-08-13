export const config = { runtime: 'nodejs18.x' }
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const body = await req.json().catch(() => null) as { file_name?: string, object_key?: string, uploaded_by?: string } | null
  if (!body || !body.file_name || !body.object_key || !body.uploaded_by) {
    return new Response(JSON.stringify({ detail: 'file_name, object_key, uploaded_by required' }), { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL as string | undefined
  const supabaseKey = process.env.SUPABASE_KEY as string | undefined
  if (!supabaseUrl || !supabaseKey) return new Response(JSON.stringify({ detail: 'Supabase 环境变量未配置' }), { status: 400 })
  const r2PublicBase = process.env.R2_PUBLIC_BASE_URL
  const r2Bucket = process.env.R2_BUCKET
  const r2AccountId = process.env.R2_ACCOUNT_ID

  const publicUrl = buildPublicUrl(body.object_key!, r2PublicBase, r2Bucket, r2AccountId)

  const supabase = createClient(supabaseUrl, supabaseKey)
  const row = {
    file_name: body.file_name,
    uploaded_by: body.uploaded_by,
    file_path: publicUrl,
    status: '已上传',
    parse_status: 'pending',
  }
  const { data, error } = await supabase.from('resume_files').insert(row).select('*').limit(1)
  if (error) return new Response(JSON.stringify({ detail: error.message }), { status: 500 })
  return new Response(JSON.stringify({ item: (data || [])[0] }), { headers: { 'Content-Type': 'application/json' } })
}

function buildPublicUrl(objectKey: string, base?: string, bucket?: string, accountId?: string): string {
  objectKey = objectKey.replace(/^\/+/, '')
  if (base && base.trim()) return `${base.replace(/\/$/, '')}/${objectKey}`
  if (!bucket || !accountId) return objectKey
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`
}

