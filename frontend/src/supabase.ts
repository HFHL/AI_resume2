import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

function readMeta(name: string): string | undefined {
  const el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  return el?.content || undefined
}

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || readMeta('supabase-url')
  const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || readMeta('supabase-anon-key')
  if (!url || !anon) return null
  try {
    cached = createClient(String(url), String(anon))
    return cached
  } catch (e) {
    console.error('创建 Supabase 客户端失败:', e)
    return null
  }
}


