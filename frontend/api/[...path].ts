export const config = { runtime: 'edge' }

const BACKEND = process.env.BACKEND_ORIGIN

function buildTargetUrl(req: Request): string {
  if (!BACKEND) throw new Error('Missing BACKEND_ORIGIN env')
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '')
  return `${BACKEND}${path}${url.search}`
}

export default async function handler(req: Request): Promise<Response> {
  let target: string
  try {
    target = buildTargetUrl(req)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Invalid config' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const headers = new Headers(req.headers)
  headers.delete('host')

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
  })

  // 直接透传后端响应
  const respHeaders = new Headers(res.headers)
  return new Response(res.body, { status: res.status, headers: respHeaders })
}
