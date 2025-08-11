import { Link } from 'react-router-dom'
import { usePositions } from '../hooks/usePositions'

export default function PositionsListPage() {
  const { items, loading } = usePositions()
  
  return (
    <section className="panel">
      <h2>职位</h2>
      <p className="muted">管理职位与关键字配置。</p>
      <div style={{ height: 12 }} />
      <Link to="/positions/create">
        <button className="primary big">＋ 新增职位</button>
      </Link>

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