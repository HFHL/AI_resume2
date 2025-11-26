import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../supabase'
import Pagination from '../components/Pagination'

type Row = { id: number; file_name: string; file_path?: string | null; status?: string | null; uploaded_by?: string | null; created_at?: string | null; resume_id?: number | null }

export default function MyUploadsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 12

  useEffect(() => {
    const user = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
    const account = (user?.account || '').trim()
    const fullName = (user?.full_name || '').trim()
    
    if (!account && !fullName) { setItems([]); setLoading(false); return }

    const sb = getSupabase()
    if (!sb) { setItems([]); setLoading(false); return }

    let query = sb.from('resume_files').select('*')

    if (account && fullName && account !== fullName) {
      // 同时匹配 account 或 full_name
      query = query.or(`uploaded_by.eq.${account},uploaded_by.eq.${fullName}`)
    } else {
      // 只有一个值有效，或者两者相同
      query = query.eq('uploaded_by', account || fullName)
    }

    query
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Fetch my files error:', error)
          setItems([])
        } else {
          setItems((data || []) as Row[])
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(() => items.slice((currentPage - 1) * pageSize, currentPage * pageSize), [items, currentPage])

  return (
    <section className="panel">
      <h2>我上传的文件</h2>
      {loading && <div className="empty">加载中...</div>}
      {!loading && pageItems.length === 0 && <div className="empty">暂无数据</div>}
      {!loading && pageItems.length > 0 && (
        <div className="list">
          {pageItems.map(it => (
            <div key={it.id} className="card">
              <div className="card-title">{it.file_name}</div>
              <div className="card-sub">上传时间：{it.created_at ? String(it.created_at).replace('T',' ').slice(0,16) : '-'}</div>
              <div className="bar" style={{ gap: 8, marginTop: 8 }}>
                {it.file_path ? <a className="ghost" href={it.file_path} target="_blank" rel="noreferrer">打开</a> : <span className="muted">无文件链接</span>}
                {it.resume_id ? <a className="ghost" href={`/resumes/${it.resume_id}`} target="_blank" rel="noreferrer">查看简历</a> : <span className="muted">未生成简历</span>}
                <span className="muted">状态：{it.status || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={currentPage} pageSize={pageSize} total={total} onChange={setPage} />
    </section>
  )
}


