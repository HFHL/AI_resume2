import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'

type PositionListItem = {
  id: number
  position_name: string
  position_category: string | null
  tags: string[] | null
  match_type: 'any' | 'all'
  created_at?: string
}

type MatchResultItem = {
  id: number
  name: string
  education_degree: string | null
  education_tiers: string[]
  skills: string[]
  matched_keywords: string[]
  hit_count: number
  score?: number
}

export default function MatchPage() {
  const navigate = useNavigate()
  const [positions, setPositions] = useState<PositionListItem[]>([])
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)

  const [matchLoading, setMatchLoading] = useState(false)
  const [results, setResults] = useState<MatchResultItem[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 12

  useEffect(() => {
    setLoadingPositions(true)
    fetch(api('/positions'))
      .then(r => r.json())
      .then(d => setPositions(d.items || []))
      .finally(() => setLoadingPositions(false))
  }, [])

  function loadMatch(id: number) {
    setActiveId(id)
    setMatchLoading(true)
    setResults([])
    setPage(1)
    fetch(api(`/positions/${id}/match`))
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text()
          throw new Error(text || `HTTP ${r.status}`)
        }
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const text = await r.text()
          throw new Error(text || '非 JSON 响应')
        }
        return r.json()
      })
      .then(d => setResults(d.items || []))
      .catch((e) => {
        console.error('加载匹配结果失败:', e)
        setResults([])
      })
      .finally(() => setMatchLoading(false))
  }

  const total = results.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(() => results.slice((currentPage - 1) * pageSize, currentPage * pageSize), [results, currentPage])

  return (
    <section className="panel">
      <h2>职位匹配</h2>
      <div className="match-layout">
        <aside className="match-aside">
          <div className="aside-title">职位列表</div>
          {loadingPositions && <div className="muted">加载中...</div>}
          {!loadingPositions && positions.length === 0 && <div className="muted">暂无职位</div>}
          <div className="aside-list">
            {positions.map(p => (
              <button
                key={p.id}
                className={`aside-item ${activeId === p.id ? 'active' : ''}`}
                onClick={() => loadMatch(p.id)}
              >
                <div className="title">{p.position_name}</div>
                <div className="sub">
                  <span>{p.position_category || '未分类'}</span>
                  <span> · </span>
                  <span>{p.match_type === 'all' ? '全部命中' : '任一命中'}</span>
                </div>
                <div className="tags">
                  {(p.tags || []).slice(0, 3).map((t, i) => <span key={i} className="pill">{t}</span>)}
                  {(p.tags || []).length > 3 && <span className="pill muted">+{(p.tags || []).length - 3}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="match-main">
          {!activeId && <div className="empty">请选择左侧职位以查看匹配结果</div>}
          {activeId && (
            <div>
              <div className="bar">
                <div className="muted">匹配结果（共 {results.length} 条）</div>
                <div style={{ flex: 1 }} />
                <button className="ghost" onClick={() => loadMatch(activeId)}>刷新</button>
              </div>
              <div className="data-table">
                <div className="table-head">
                  <div>姓名</div>
                  <div>命中关键词</div>
                  <div className="hide-on-narrow">信息</div>
                  <div className="hide-on-narrow">分数</div>
                </div>
                {matchLoading && <div className="empty">加载中...</div>}
                {!matchLoading && pageItems.map(item => (
                  <div key={item.id} className="table-row clickable" onClick={() => activeId && navigate(`/match/${activeId}/resumes/${item.id}`)}>
                    <div className="cell-name">
                      <div className="name">{item.name}</div>
                      <div className="muted small">命中 {item.hit_count} 个</div>
                    </div>
                    <div className="cell-tags">
                      <div className="card-tags">
                        {item.matched_keywords.map((t, i) => <span key={i} className="pill">{t}</span>)}
                      </div>
                    </div>
                    <div className="cell-meta hide-on-narrow">
                      {item.education_degree && <span className="pill muted">{item.education_degree}</span>}
                      {(item.education_tiers || []).map((t, i) => <span key={i} className="pill muted">{t}</span>)}
                    </div>
                    <div className="hide-on-narrow" style={{display:'flex',alignItems:'center'}}>
                      <strong>{Math.round((item.score ?? 0))}</strong>
                    </div>
                  </div>
                ))}
                {!matchLoading && pageItems.length === 0 && (
                  <div className="empty">无匹配结果</div>
                )}
              </div>
              <div className="pagination">
                <button className="ghost" onClick={() => setPage(1)} disabled={currentPage === 1}>«</button>
                <button className="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>上一页</button>
                <div className="muted small">第 {currentPage} / {totalPages} 页</div>
                <button className="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>下一页</button>
                <button className="ghost" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}>»</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  )
}