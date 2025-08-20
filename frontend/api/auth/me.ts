export const config = { runtime: 'nodejs' }

// 最简版：不做鉴权，直接返回一个匿名用户（让前端通过）
export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({ user: { id: 0, username: 'anonymous', role: 'staff' } }), { headers: { 'Content-Type': 'application/json' } })
}


