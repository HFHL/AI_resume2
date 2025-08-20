export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  return new Response(JSON.stringify({
    ok: true,
    method: req.method,
    now: new Date().toISOString()
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}


