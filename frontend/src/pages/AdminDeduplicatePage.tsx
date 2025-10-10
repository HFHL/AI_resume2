import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Pagination from '../components/Pagination'

type Rule = 'email' | 'phone' | 'name' | 'filename'
type Group = { key: string; count: number; ids: number[]; rows: Array<{ id:number; name?:string|null; email?:string|null; phone?:string|null; created_at?:string|null }> }

export default function AdminDeduplicatePage() {
  const [rule, setRule] = useState<Rule>('email')
  const [minSize, setMinSize] = useState(2)
  const [items, setItems] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    try {
      const url = api(`/resumes/duplicates/${rule}?min_group_size=${minSize}&limit=200&offset=0`)
      const r = await fetch(url, { headers: { 'x-admin': 'true' } })
      const d = await r.json()
      const arr: Group[] = Array.isArray(d?.items) ? d.items : []
      setItems(arr)
      // 默认勾选每组除最新外的所有 id
      const next = new Set<number>()
      for (const g of arr) {
        const ids = Array.isArray(g.ids) ? g.ids : []
        for (let i = 1; i < ids.length; i++) next.add(ids[i])
      }
      setSelected(next)
      setPage(1)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [rule, minSize])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(() => items.slice((currentPage - 1) * pageSize, currentPage * pageSize), [items, currentPage])

  function toggleOne(id: number, checked: boolean) {
    setSelected(prev => {
      const s = new Set(prev)
      if (checked) s.add(id); else s.delete(id)
      return s
    })
  }

  function selectAllCurrentPage(del: boolean) {
    setSelected(prev => {
      const s = new Set(prev)
      for (const g of pageItems) {
        const ids = g.ids || []
        for (let i = 1; i < ids.length; i++) { // 除最新外
          if (del) s.add(ids[i]); else s.delete(ids[i])
        }
      }
      return s
    })
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) { alert('未选择任何记录'); return }
    if (!confirm(`确定删除选中的 ${ids.length} 条吗？`)) return
    const r = await fetch(api('/resumes/bulk_delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin': 'true' },
      body: JSON.stringify({ ids })
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d?.detail || '删除失败'); return }
    const delSet = new Set<number>(ids)
    setItems(prev => prev.map(g => ({ ...g, ids: g.ids.filter(id => !delSet.has(id)), rows: g.rows.filter(r => !delSet.has(r.id)), count: g.count - g.rows.filter(r => delSet.has(r.id)).length })).filter(g => g.count > 1))
    setSelected(new Set())
    alert('已删除（软删除）')
  }

  return (
    <section className="panel">
      <h2>去重（管理员）</h2>
      <div className="bar" style={{ gap: 8 }}>
        <label>规则
          <select value={rule} onChange={e => setRule(e.target.value as Rule)}>
            <option value="email">按邮箱</option>
            <option value="phone">按手机号</option>
            <option value="name">按姓名+联系方式</option>
            <option value="filename">按文件名</option>
          </select>
        </label>
        <label>组大小≥
          <input type="number" min={2} step={1} value={minSize} onChange={e => setMinSize(Math.max(2, parseInt(e.target.value || '2', 10) || 2))} />
        </label>
        <button className="ghost" onClick={() => load()} disabled={loading}>刷新</button>
        <div style={{ flex: 1 }} />
        <button className="ghost" onClick={() => selectAllCurrentPage(true)}>当前页全选（保留最新）</button>
        <button className="ghost" onClick={() => selectAllCurrentPage(false)}>取消全选</button>
        <button className="danger" onClick={bulkDelete} disabled={selected.size === 0}>删除选中</button>
      </div>

      {loading && <div className="empty">加载中...</div>}
      {!loading && pageItems.length === 0 && <div className="empty">暂无分组</div>}
      {!loading && pageItems.length > 0 && (
        <div className="list">
          {pageItems.map(g => (
            <div key={g.key} className="card">
              <div className="card-title">{g.key}</div>
              <div className="card-sub">重复：{g.count}</div>
              <div className="list">
                {g.rows.map((r, idx) => (
                  <div key={r.id} className="bar" style={{ alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={e => toggleOne(r.id, e.target.checked)} title="删除此记录" />
                    <span className="muted">#{r.id}</span>
                    <a className="ghost" href={`/resumes/${r.id}`} target="_blank" rel="noreferrer">查看</a>
                    <span style={{ flex: 1 }}>{r.name || '未知'}</span>
                    <span className="muted">{r.email || '-'}</span>
                    <span className="muted">{r.phone || '-'}</span>
                    <span className="muted">{r.created_at ? String(r.created_at).replace('T',' ').slice(0,16) : '-'}</span>
                    {idx === 0 && <span className="pill">保留</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={currentPage} pageSize={pageSize} total={total} onChange={setPage} />
    </section>
  )
}


