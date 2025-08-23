export const config = { runtime: 'edge' }

function parseIdFromUrl(urlStr: string): number | null {
	let url: URL
	try { url = new URL(urlStr) } catch { url = new URL(urlStr, 'http://localhost') }
	const parts = url.pathname.split('/').filter(Boolean)
	const idStr = parts[parts.length - 1]
	const id = Number(idStr)
	return Number.isFinite(id) && id > 0 ? id : null
}

export default async function handler(req: Request): Promise<Response> {
	try {
		const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
		// 优先使用 SERVICE_ROLE，其次回退到 SUPABASE_KEY（仅演示用途）
		const EFFECTIVE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) || (process.env.SUPABASE_KEY as string | undefined)
		console.log('[api/resumes/[id]] env', { hasUrl: Boolean(SUPABASE_URL), hasKey: Boolean(EFFECTIVE_KEY) })
		if (!SUPABASE_URL || !EFFECTIVE_KEY) {
			return new Response(JSON.stringify({ detail: '缺少 SUPABASE_URL 或 KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
		}

		const id = parseIdFromUrl(req.url)
		if (!id) return new Response(JSON.stringify({ detail: 'resume id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		console.log('[api/resumes/[id]] incoming', { method: req.method, id })

		if (req.method === 'DELETE') {
			const isAdmin = (req.headers.get('x-admin') || '').toLowerCase() === 'true'
			if (!isAdmin) return new Response(JSON.stringify({ detail: '仅管理员可删除简历' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

			const delUrl = `${SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/resumes?id=eq.${id}`
			const delResp = await fetch(delUrl, {
				method: 'DELETE',
				headers: {
					'apikey': EFFECTIVE_KEY!,
					'Authorization': `Bearer ${EFFECTIVE_KEY!}`,
					'Prefer': 'return=representation',
					'Accept': 'application/json',
				},
			})
			if (!delResp.ok) {
				const text = await delResp.text().catch(() => '')
				return new Response(JSON.stringify({ detail: text || `DELETE failed ${delResp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}
			const deletedRows = await delResp.json().catch(() => []) as any[]
			const deleted = Array.isArray(deletedRows) && deletedRows.length > 0 ? deletedRows[0] : null
			if (!deleted) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
			return new Response(JSON.stringify({ ok: true, deleted }), { headers: { 'Content-Type': 'application/json' } })
		}

		// GET 详情
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 9000)
		const base = SUPABASE_URL!.replace(/\/$/, '')
		const detailUrl = `${base}/rest/v1/resumes?select=*&id=eq.${id}&limit=1`
		const resp = await fetch(detailUrl, {
			method: 'GET',
			headers: {
				'apikey': EFFECTIVE_KEY!,
				'Authorization': `Bearer ${EFFECTIVE_KEY!}`,
				'Accept': 'application/json',
			},
			signal: controller.signal,
		}).catch((e) => {
			console.error('[api/resumes/[id]] fetch error', e)
			return null as unknown as Response
		})
		clearTimeout(timeout)
		if (!resp) {
			return new Response(JSON.stringify({ detail: 'Supabase 请求失败' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
		}
		if (!resp.ok) {
			const text = await resp.text().catch(() => '')
			return new Response(JSON.stringify({ detail: text || `Resumes 错误: ${resp.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const rows = await resp.json().catch(() => []) as any[]
		const item = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
		if (!item) return new Response(JSON.stringify({ detail: '简历不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		console.log('[api/resumes/[id]] base row fetched', { id, hasFileId: Boolean(item.resume_file_id) })

		// 若有文件 ID，则查询文件链接与上传者
		if (item.resume_file_id) {
			const fileUrl = `${base}/rest/v1/resume_files?select=file_path,uploaded_by&id=eq.${encodeURIComponent(String(item.resume_file_id))}&limit=1`
			const fResp = await fetch(fileUrl, {
				method: 'GET',
				headers: {
					'apikey': EFFECTIVE_KEY!,
					'Authorization': `Bearer ${EFFECTIVE_KEY!}`,
					'Accept': 'application/json',
				},
			})
			if (fResp.ok) {
				const fRows = await fResp.json().catch(() => []) as any[]
				const f = Array.isArray(fRows) && fRows.length > 0 ? fRows[0] : null
				if (f && f.file_path) item.file_url = f.file_path
				if (f && typeof f.uploaded_by !== 'undefined') (item as any).uploaded_by = f.uploaded_by || null
			}
		}

		console.log('[api/resumes/[id]] respond', { id, hasUrl: Boolean(item.file_url) })
		return new Response(JSON.stringify({ item }), { headers: { 'Content-Type': 'application/json' } })
	} catch (e: any) {
		console.error('[api/resumes/[id]] unhandled', e)
		return new Response(JSON.stringify({ detail: e?.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}
