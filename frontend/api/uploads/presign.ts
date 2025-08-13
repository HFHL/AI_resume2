export const config = { runtime: 'nodejs' }

import { createClient } from '@supabase/supabase-js'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const body = (await req.json().catch(() => null)) as { file_name?: string; content_type?: string } | null
  if (!body || !body.file_name) {
    return new Response(JSON.stringify({ detail: 'file_name required' }), { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    return new Response(
      JSON.stringify({ detail: 'Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET' }),
      { status: 400 }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const safeName = body.file_name.replace(/[/\\]/g, '_')
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `resumes/original/${ts}_${rand}_${safeName}`

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data) {
    return new Response(JSON.stringify({ detail: error?.message || 'createSignedUploadUrl failed' }), { status: 500 })
  }

  // 可选：若桶为 public，提供 publicUrl 便于前端预览
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)

  return new Response(
    JSON.stringify({ path, token: data.token, bucket, signed_url: data.signedUrl, public_url: pub?.publicUrl || null }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}