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
  const groupKeyMap: Record<Rule,string> = { email: 'email', phone: 'phone', name: 'name_contact', filename: 'filename' }

  async function load() {
    setLoading(true)
    try {
      const url = api(`/resumes/duplicates/${rule}?min_group_size=${minSize}&limit=200&offset=0`)
      const r = await fetch(url, { headers: { 'x-admin': 'true' } })
      const d = await r.json()
      const arr: Group[] = Array.isArray(d?.items) ? d.items : []
      setItems(arr)
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

  async function setGroupCanonical(g: Group, keepId: number) {
    const hideIds = (g.ids || []).filter(id => id !== keepId)
    if (hideIds.length === 0) { alert('本组无可隐藏项'); return }
    const key = groupKeyMap[rule]
    const r = await fetch(api('/resumes/dedup/mark_canonical'), {
      method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin':'true' },
      body: JSON.stringify({ keep_id: keepId, hide_ids: hideIds, group_key: key })
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d?.detail || '保存失败'); return }
    // 刷新本组显示（is_dedup_hidden 标记）
    setItems(prev => prev.map(x => x.key === g.key ? {
      ...x,
      rows: x.rows.map(row => ({ ...row, is_dedup_hidden: row.id !== keepId })),
      ids: x.rows.map(row => row.id),
      count: x.rows.length,
    } : x))
    alert('已设置保留并隐藏其余')
  }

  async function keepAllNewest() {
    for (const g of items) {
      const ids = g.ids || []
      if (ids.length <= 1) continue
      const newest = ids[0]
      await setGroupCanonical(g, newest)
    }
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
        <button className="primary" onClick={keepAllNewest} disabled={items.length === 0}>一键保留每组最新</button>
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
                    <span className="muted">#{r.id}</span>
                    <a className="ghost" href={`/resumes/${r.id}`} target="_blank" rel="noreferrer">查看</a>
                    <span style={{ flex: 1 }}>{r.name || '未知'}</span>
                    <span className="muted">{r.email || '-'}</span>
                    <span className="muted">{r.phone || '-'}</span>
                    <span className="muted">{r.created_at ? String(r.created_at).replace('T',' ').slice(0,16) : '-'}</span>
                    {!(r as any).is_dedup_hidden ? <span className="pill">保留</span> : <span className="muted">隐藏</span>}
                    <button className="primary" onClick={() => setGroupCanonical(g, r.id)}>设为保留</button>
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


