import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Pagination from '../components/Pagination'

type Row = { id: number; name: string | null; deleted_at?: string | null }

export default function AdminDeletedResumesPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 12

  useEffect(() => {
    const url = api('/resumes?only_deleted=true&limit=all&offset=0&admin=true')
    fetch(url, { headers: { 'x-admin': 'true' } })
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d?.items) ? d.items : []
        const rows: Row[] = arr.map((r: any) => ({ id: r.id, name: r.name || '未知', deleted_at: r.deleted_at || null }))
        setItems(rows)
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
      <h2>回收站（已删除简历）</h2>
      {loading && <div className="empty">加载中...</div>}
      {!loading && pageItems.length === 0 && <div className="empty">暂无已删除数据</div>}
      {!loading && pageItems.length > 0 && (
        <div className="list">
          {pageItems.map(it => (
            <div key={it.id} className="card">
              <div className="card-title">#{it.id} {it.name}</div>
              <div className="card-sub">删除时间：{it.deleted_at ? String(it.deleted_at).replace('T',' ').slice(0,16) : '-'}</div>
              <div className="bar" style={{ marginTop: 8 }}>
                <button className="ghost" onClick={async () => {
                  if (!confirm('确定恢复该简历吗？')) return
                  const r = await fetch(api(`/resumes/${it.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin': 'true' }, body: JSON.stringify({ is_deleted: false, deleted_at: null }) })
                  if (!r.ok) { alert('恢复失败'); return }
                  setItems(prev => prev.filter(x => x.id !== it.id))
                }}>恢复</button>
                <a className="ghost" href={`/resumes/${it.id}`} target="_blank" rel="noreferrer">查看</a>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={currentPage} pageSize={pageSize} total={total} onChange={setPage} />
    </section>
  )
}


