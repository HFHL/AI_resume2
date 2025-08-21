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
  education_school?: string[]
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
              <div className="match-resume-cards">
                {matchLoading && <div className="empty">加载中...</div>}
                {!matchLoading && pageItems.map(item => (
                  <div
                    key={item.id}
                    className="match-resume-card"
                    onClick={() => {
                      if (!activeId) return
                      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
                      const state = { activeId, page, scrollY }
                      try { sessionStorage.setItem('matchReturnState', JSON.stringify(state)) } catch {}
                      const url = `/resumes/${item.id}`
                      window.open(url, '_blank')
                    }}
                  >
                    <div className="card-left">
                      <div className="name-section">
                        <div className="name">{item.name}</div>
                        <div className="education-info">
                          {Array.isArray(item.education_school) && item.education_school.length > 0 && (
                            <div className="schools">
                              {item.education_school.map((s, i) => (
                                <span key={i} className="school-item">{s}</span>
                              ))}
                            </div>
                          )}
                          {item.education_degree && (
                            <div className="degree">{item.education_degree}</div>
                          )}
                        </div>
                      </div>
                      <div className="meta-info">
                        {item.created_at && (
                          <div className="created-time">
                            录入时间：{String(item.created_at).replace('T',' ').slice(0, 10)}
                          </div>
                        )}
                        {item.work_years !== undefined && item.work_years !== null && (
                          <div className="work-years">工作年限：{item.work_years}年</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="card-center">
                      <div className="work-experience">
                        <div className="section-title">工作经历</div>
                        {Array.isArray(item.work_experience) && item.work_experience.length > 0 ? (
                          <div className="experience-list">
                            {item.work_experience.slice(0, 3).map((exp, i) => {
                              const raw = (exp || '').trim()
                              const s = raw.length > 80 ? raw.slice(0, 80) + '…' : raw
                              const jobKeywords = ['工程师','经理','开发','产品','运营','测试','设计','前端','后端','全栈','算法','数据','销售','市场','人力','HR','专家','负责人','总监','主管','实习','分析师','科学家','架构师','运维','支持','客服','BD','商务','财务','法务','审计']
                              const dateRe = /^\s*(\d{4}(?:[./年]\s*\d{1,2})?(?:\s*[—\-–~至到]+\s*(?:至今|现在|\d{4}(?:[./年]\s*\d{1,2})?))?)/
                              const dm = s.match(dateRe)
                              const datePrefix = dm ? dm[0] : ''
                              const rest0 = s.slice(datePrefix.length).trim()
                              if (rest0) {
                                let splitPos = -1
                                for (const kw of jobKeywords) {
                                  const idx = rest0.indexOf(kw)
                                  if (idx > 0 && (splitPos === -1 || idx < splitPos)) splitPos = idx
                                }
                                if (splitPos > 0) {
                                  const company = rest0.slice(0, splitPos).trim()
                                  const roleAll = rest0.slice(splitPos).trim()
                                  const m2 = roleAll.match(/^(\S.+?)([，,。;；].+)?$/)
                                  const role = m2 ? m2[1] : roleAll
                                  const tail = m2 && m2[2] ? m2[2] : ''
                                  return (
                                    <div key={i} className="experience-item">
                                      {datePrefix}
                                      {company && <><span className="hl-company">{company}</span>{' '}</>}
                                      {role && <span className="hl-role">{role}</span>}
                                      {tail}
                                    </div>
                                  )
                                }
                              }
                              return (
                                <div key={i} className="experience-item">{s || '-'}</div>
                              )
                            })}
                            {item.work_experience.length > 3 && (
                              <div className="more-indicator">还有 {item.work_experience.length - 3} 条经历...</div>
                            )}
                          </div>
                        ) : (
                          <div className="no-data">暂无工作经历</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="card-right">
                      <div className="tags-section">
                        <div className="section-title">标签</div>
                        <div className="tags-list">
                          {(item.tag_names || []).length ? (
                            (item.tag_names || []).slice(0, 8).map((t, i) => (
                              <span key={i} className="tag-item">{t}</span>
                            ))
                          ) : (
                            <span className="no-data">无标签</span>
                          )}
                          {(item.tag_names || []).length > 8 && (
                            <span className="more-tags">+{(item.tag_names || []).length - 8}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="tiers-section">
                        <div className="section-title">院校层次</div>
                        <div className="tiers-list">
                          {(item.education_tiers || []).length > 0 ? (
                            (item.education_tiers || []).map((t, i) => {
                              const isHighlight = ['985', '211', '海外留学'].includes(t)
                              return (
                                <span key={i} className={`tier-item ${isHighlight ? 'highlight' : ''}`}>{t}</span>
                              )
                            })
                          ) : (
                            <span className="no-data">未知</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="match-score">
                        <div className="section-title">匹配分数</div>
                        <div className="score-value">{Math.round((item.score ?? 0))}</div>
                      </div>
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