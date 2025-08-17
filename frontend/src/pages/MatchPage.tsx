import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

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
  tag_names?: string[]
  work_years?: number | null
  created_at?: string | null
  work_experience?: string[]
}

export default function MatchPage() {
  const [positions, setPositions] = useState<PositionListItem[]>([])
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)

  const [matchLoading, setMatchLoading] = useState(false)
  const [results, setResults] = useState<MatchResultItem[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 12
  const restoreRef = useRef<{ activeId: number; page: number; scrollY: number } | null>(null)

  useEffect(() => {
    setLoadingPositions(true)
    fetch(api('/positions'))
      .then(r => r.json())
      .then(d => setPositions(d.items || []))
      .finally(() => setLoadingPositions(false))
  }, [])

  // 恢复返回前的查看位置（职位ID、页码、滚动位置）
	useEffect(() => {
    const raw = sessionStorage.getItem('matchReturnState')
    if (!raw) return
    try {
      const st = JSON.parse(raw) as { activeId: number; page: number; scrollY: number }
      if (st && st.activeId) {
        restoreRef.current = st
        setActiveId(st.activeId)
        setPage(st.page || 1)
				loadMatch(st.activeId, { keepPage: true })
      }
    } catch {}
  }, [])

  function loadMatch(id: number, opts?: { keepPage?: boolean }) {
    setActiveId(id)
    setMatchLoading(true)
    setResults([])
    if (!opts?.keepPage) {
      setPage(1)
    }
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

  // 在结果加载完成后，若存在需要恢复的滚动位置，则滚动并清理状态
  useEffect(() => {
    if (!matchLoading && restoreRef.current) {
      const y = restoreRef.current.scrollY || 0
      requestAnimationFrame(() => {
        window.scrollTo({ top: y })
        sessionStorage.removeItem('matchReturnState')
        restoreRef.current = null
      })
    }
  }, [matchLoading])

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
                  <div>工作经历</div>
                  <div className="hide-on-narrow">信息</div>
                  <div className="hide-on-narrow">分数</div>
                </div>
                {matchLoading && <div className="empty">加载中...</div>}
                {!matchLoading && pageItems.map(item => (
                  <div
                    key={item.id}
                    className="table-row clickable"
                    onClick={() => {
                      if (!activeId) return
                      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
                      const state = { activeId, page, scrollY }
                      try { sessionStorage.setItem('matchReturnState', JSON.stringify(state)) } catch {}
                      const url = `/resumes/${item.id}`
                      window.open(url, '_blank')
                    }}
                  >
                    <div className="cell-name">
                      <div className="name">{item.name}</div>
                    </div>
                    <div className="cell-tags">
                      {/* 标签展示，与 ResumesPage 保持一致的风格 */}
                      <div className="card-tags" style={{ marginBottom: 6 }}>
                        {(item.tag_names || []).length ? (
                          (item.tag_names || []).slice(0, 6).map((t, i) => (
                            <span key={i} className="pill">{t}</span>
                          ))
                        ) : <span className="muted">无标签</span>}
                        {(item.tag_names || []).length > 6 && <span className="pill muted">+{(item.tag_names || []).length - 6}</span>}
                      </div>
                      {/* 工作经历长文本（合并后的） */}
                      <div className="list-text">
                        {Array.isArray(item.work_experience) && item.work_experience.length > 0 ? (
                          <ul>
                            {item.work_experience.map((t, i) => {
                              const s = (t || '').trim()
                              const short = s.length > 50 ? s.slice(0, 50) + '…' : s
                              return <li key={i}>{short || '-'}</li>
                            })}
                          </ul>
                        ) : (
                          <span className="muted">无工作经历</span>
                        )}
                      </div>
                    </div>
                    <div className="cell-meta hide-on-narrow">
                      {item.education_degree && <span className="pill muted">{item.education_degree}</span>}
                      {(item.education_tiers || []).map((t, i) => <span key={i} className="pill muted">{t}</span>)}
                      {item.work_years !== undefined && item.work_years !== null && <span className="pill muted">{item.work_years}年</span>}
                      {item.created_at && (
                        <span className="pill muted">录入 {String(item.created_at).replace('T',' ').slice(0, 10)}</span>
                      )}
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