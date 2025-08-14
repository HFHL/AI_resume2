import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

type PositionItem = {
  id: number
  position_name: string
  position_category: string | null
  tags: string[] | null
  match_type: 'any' | 'all'
}

export default function PositionsListPage() {
  const [items, setItems] = useState<PositionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    loadPositions()
  }, [])

  async function loadPositions(searchTerm?: string) {
    setLoading(true)
    try {
      const url = searchTerm ? `/positions?q=${encodeURIComponent(searchTerm)}` : '/positions'
      const r = await fetch(api(url))
      if (!r.ok) throw new Error('加载失败')
      const d = await r.json()
      setItems(d.items || [])
    } catch (error) {
      console.error('Error fetching positions:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  async function doSearch() {
    const q = query.trim()
    if (!q) {
      setSearching(false)
      loadPositions()
      return
    }
    setSearching(true)
    loadPositions(q)
  }

  function clearSearch() {
    setQuery('')
    setSearching(false)
    loadPositions()
  }
  
  return (
    <section className="panel">
      <h2>职位</h2>
      <p className="muted">管理职位与关键字配置。</p>
      
      <div className="bar" style={{ marginTop: 12 }}>
        <input
          placeholder="搜索职位名称或关键词..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={doSearch} disabled={loading}>搜索</button>
        {searching && <button className="ghost" onClick={clearSearch}>清空搜索</button>}
      </div>

      <div style={{ marginTop: 12 }}>
        <Link to="/positions/create">
          <button className="primary big">＋ 新增职位</button>
        </Link>
      </div>

      <div style={{ height: 16 }} />
      <div className="list">
        {loading && <div className="muted">加载中...</div>}
        {!loading && items.length === 0 && <div className="muted">暂无职位</div>}
        {!loading && items.map(p => (
          <Link key={p.id} to={`/positions/${p.id}`} className="card">
            <div className="card-title">{p.position_name}</div>
            <div className="card-sub">
              <span>{p.position_category || '未分类'}</span>
              <span> · </span>
              <span>{p.match_type === 'all' ? '全部命中' : '任一命中'}</span>
            </div>
            <div className="card-tags">
              {(p.tags || []).slice(0, 4).map((t, i) => (
                <span key={i} className="pill">{t}</span>
              ))}
              {(p.tags || []).length > 4 && (
                <span className="pill muted">+{(p.tags || []).length - 4}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}