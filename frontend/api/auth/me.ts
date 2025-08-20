export const config = { runtime: 'nodejs' }
import { requireUser } from '../lib/auth.js'

export default async function handler(req: Request): Promise<Response> {
  try {
    const u = await requireUser(req)
    return new Response(JSON.stringify({ user: u }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    if (e instanceof Response) return e
    return new Response(JSON.stringify({ detail: e?.message || '未认证' }), { status: 401 })
  }
}


