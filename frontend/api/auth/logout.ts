export const config = { runtime: 'nodejs' }
import { setCookie } from '../lib/auth.js'

export default async function handler(): Promise<Response> {
  const cookie = setCookie('auth', '', { httpOnly: true, sameSite: 'Lax', path: '/', secure: !!process.env.VERCEL, maxAge: 0 })
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } })
}


