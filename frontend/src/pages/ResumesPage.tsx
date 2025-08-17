import { useEffect, useMemo, useState } from 'react'
import Chip from '../components/Chip'
import { api } from '../api'
import Pagination from '../components/Pagination'

type ResumeItem = {
  id: number
  name: string
  tags: string[] // 等同于 tag_names，用于渲染与筛选
  tag_names: string[]
  work_years: number | null
  degree: '' | '本科' | '硕士' | '博士'
  tiers: Array<'985' | '211' | '双一流' | '海外留学'>
  schools?: string[]
  created_at?: string
  work_experience?: string[]
}

type Tag = {
  id: number
  tag_name: string
  category: string
}

export default function ResumesPage() {
  const [items, setItems] = useState<ResumeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [idToTags, setIdToTags] = useState<Map<number, string[]>>(new Map())
  
  // 获取所有标签数据
  useEffect(() => {
    fetch(api('/tags')).then(r => r.json()).then(data => {
      setAllTags(data.items || [])
    }).catch(() => {
      setAllTags([])
    })
  }, [])

  // 加载每份简历的 tag_names
  useEffect(() => {
    const url = api('/resumes/tags')
    console.log('[ResumesPage] Fetch resume tags URL:', url)
    fetch(url)
      .then(r => r.json())
      .then(d => {
        try {
          const sample = Array.isArray(d?.items) ? d.items.slice(0, 3) : d
          console.log('[ResumesPage] /resumes/tags raw first3:', sample)
        } catch {}
        const map = new Map<number, string[]>()
        for (const x of (d.items || [])) {
          if (x && typeof x.id === 'number' && Array.isArray(x.tag_names)) {
            map.set(x.id, x.tag_names)
          }
        }
        setIdToTags(map)
        console.log('[ResumesPage] resume tags map size:', map.size)
      })
      .catch(() => setIdToTags(new Map()))
  }, [])
  
  useEffect(() => {
    setLoading(true)
    const url = api('/resumes')
    console.log('[ResumesPage] Fetch list URL:', url)
    fetch(url)
      .then(r => r.json())
      .then((d) => {
        try {
          const sample = Array.isArray(d?.items) ? d.items.slice(0, 3) : d
          console.log('[ResumesPage] /resumes raw first3:', sample)
        } catch {}
        const rows = (d.items || []) as Array<{
          id: number
          name: string | null
          tag_names?: string[] | null
          education_degree: string | null
          education_tiers: string[] | null
          education_school?: string[] | null
          work_years: number | null
          created_at?: string | null
          work_experience?: string[] | null
        }>
        
        const normalizeDegree = (x: string | null | undefined): ResumeItem['degree'] => {
          const s = (x || '').trim()
          if (!s) return ''
          if (s.includes('博')) return '博士'
          if (s.includes('硕')) return '硕士'
          if (s.includes('本')) return '本科'
          return ''
        }
        
        const normalizeTiers = (arr: string[] | null | undefined): ResumeItem['tiers'] => {
          const mapped = (arr || []).map(t => {
            const v = t.replace('海外', '海外留学')
            return v as ResumeItem['tiers'][number]
          }).filter(v => ['985','211','双一流','海外留学'].includes(v)) as ResumeItem['tiers']
          return Array.from(new Set(mapped)) as ResumeItem['tiers']
        }

        const mapped: ResumeItem[] = rows.map(r => {
          const externalTags = idToTags.get(r.id) || []
          const fallbackTags = (r.tag_names || [])
          const tagNames = (externalTags.length ? externalTags : fallbackTags).map(s => s.trim()).filter(Boolean)
          
          return {
            id: r.id,
            name: r.name || '未知',
            tags: tagNames,
            tag_names: tagNames,
            work_years: r.work_years,
            degree: normalizeDegree(r.education_degree),
            tiers: normalizeTiers(r.education_tiers),
            schools: (r.education_school || undefined) as any,
            created_at: (r as any).created_at || undefined,
            work_experience: (r as any).work_experience || [],
          }
        })
        
        console.log('[ResumesPage] mapped first3:', mapped.slice(0, 3))
        setItems(mapped)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [idToTags, allTags])

  async function doSearch(next?: string) {
    const q = (next ?? query).trim()
    setPage(1)
    if (!q) {
      // 恢复初始列表
      setSearching(false)
      setLoading(true)
      try {
        const url = api('/resumes')
        console.log('[ResumesPage] Fetch list URL (reset):', url)
        const r = await fetch(url)
        if (!r.ok) {
          const errorData = await r.json().catch(() => ({ detail: 'Unknown error' }))
          console.error('Failed to fetch resumes:', errorData)
          alert(`获取简历列表失败: ${errorData.detail || r.statusText}`)
          return
        }
        const d = await r.json()
        try {
          const sample = Array.isArray(d?.items) ? d.items.slice(0, 3) : d
          console.log('[ResumesPage] /resumes raw first3 (reset):', sample)
        } catch {}
        const rows = (d.items || []) as Array<{ id:number; name:string|null; tag_names?:string[]|null; education_degree:string|null; education_tiers:string[]|null; work_years:number|null; created_at?: string | null; work_experience?: string[] | null }>
        const mapped = mapRows(rows, idToTags, allTags)
        console.log('[ResumesPage] mapped first3 (reset):', mapped.slice(0, 3))
        setItems(mapped)
      } catch (error) {
        console.error('Error fetching resumes:', error)
        alert('获取简历列表失败，请检查网络连接')
      } finally {
        setLoading(false)
      }
      return
    }
    setSearching(true)
    setLoading(true)
    try {
      const searchUrl = api(`/resumes?q=${encodeURIComponent(q)}`)
      console.log('[ResumesPage] Fetch search URL (index.ts on edge):', searchUrl)
      const r = await fetch(searchUrl)
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ detail: 'Unknown error' }))
        console.error('Search failed:', errorData)
        alert(`搜索失败: ${errorData.detail || r.statusText}`)
        return
      }
      const d = await r.json()
      try {
        const sample = Array.isArray(d?.items) ? d.items.slice(0, 3) : d
        console.log('[ResumesPage] /resumes raw first3 (search):', sample)
      } catch {}
      const rows = (d.items || []) as Array<{ id:number; name:string|null; tag_names?:string[]|null; education_degree:string|null; education_tiers:string[]|null; work_years:number|null; created_at?: string | null; work_experience?: string[] | null }>
      const mapped = mapRows(rows, idToTags, allTags)
      console.log('[ResumesPage] mapped first3 (search):', mapped.slice(0, 3))
      setItems(mapped)
    } catch (error) {
      console.error('Search error:', error)
      alert('搜索失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  function mapRows(
    rows: Array<{ id:number; name:string|null; tag_names?:string[]|null; education_degree:string|null; education_tiers:string[]|null; education_school?: string[] | null; work_years:number|null; created_at?: string | null; work_experience?: string[] | null }>,
    tagMap?: Map<number, string[]>,
    allTagsArr?: Tag[],
  ): ResumeItem[] {
    const normalizeDegree = (x: string | null | undefined): ResumeItem['degree'] => {
      const s = (x || '').trim()
      if (!s) return ''
      if (s.includes('博')) return '博士'
      if (s.includes('硕')) return '硕士'
      if (s.includes('本')) return '本科'
      return ''
    }
    const normalizeTiers = (arr: string[] | null | undefined): ResumeItem['tiers'] => {
      const mapped = (arr || []).map(t => {
        const v = t.replace('海外', '海外留学')
        return v as ResumeItem['tiers'][number]
      }).filter(v => ['985','211','双一流','海外留学'].includes(v)) as ResumeItem['tiers']
      return Array.from(new Set(mapped)) as ResumeItem['tiers']
    }

    return rows.map(r => {
      const externalTags = tagMap?.get(r.id) || []
      const fallbackTags = (r.tag_names || []).map(s => s.trim()).filter(Boolean)
      const tagNames = externalTags.length ? externalTags : fallbackTags

      return {
        id: r.id,
        name: r.name || '未知',
        tags: tagNames,
        tag_names: tagNames,
        work_years: r.work_years,
        degree: normalizeDegree(r.education_degree),
        tiers: normalizeTiers(r.education_tiers),
        schools: (r.education_school || undefined) as any,
        created_at: r.created_at || undefined,
        work_experience: (r.work_experience || []) as string[],
      }
    })
  }

  // 应用到列表的筛选（按"应用筛选"按钮后生效）
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [yearsBand, setYearsBand] = useState<'不限' | '1年以内' | '1-3年' | '3-5年' | '5-10年' | '10年以上'>('不限')
  const [degree, setDegree] = useState<'' | '本科' | '硕士' | '博士'>('')
  const [tiers, setTiers] = useState<Array<'985' | '211' | '双一流' | '海外留学'>>([])
  const [page, setPage] = useState(1)

  // UI 中待编辑的筛选（实时变更，不立即生效）
  const [uiSelectedTags, setUiSelectedTags] = useState<string[]>(selectedTags)
  const [uiYearsBand, setUiYearsBand] = useState<typeof yearsBand>(yearsBand)
  const [uiDegree, setUiDegree] = useState<typeof degree>(degree)
  const [uiTiers, setUiTiers] = useState<typeof tiers>(tiers)
  const pageSize = 12

  // 获取所有可用的标签
  const availableTagsForCategory = useMemo(() => {
    return allTags.map(t => t.tag_name)
  }, [allTags])

  function resetAll() {
    setUiSelectedTags([])
    setUiYearsBand('不限')
    setUiDegree('')
    setUiTiers([])
  }

  function applyFilters() {
    setSelectedTags(uiSelectedTags)
    setYearsBand(uiYearsBand)
    setDegree(uiDegree)
    setTiers(uiTiers)
    setPage(1)
  }

  function toggleTag(tag: string) {
    setUiSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  
  function removeTag(tag: string) {
    setUiSelectedTags(prev => prev.filter(t => t !== tag))
  }
  
  function toggleTier(t: ResumeItem['tiers'][number]) {
    setUiTiers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function matchYears(y: number | null) {
    switch (yearsBand) {
      case '不限': return true
      case '1年以内': return y !== null && y < 1
      case '1-3年': return y !== null && y >= 1 && y < 3
      case '3-5年': return y !== null && y >= 3 && y < 5
      case '5-10年': return y !== null && y >= 5 && y < 10
      case '10年以上': return y !== null && y >= 10
    }
  }

  const filtered = useMemo(() => {
    const degreeLevel = (d: ResumeItem['degree']) => d === '博士' ? 3 : d === '硕士' ? 2 : d === '本科' ? 1 : 0
    const requiredLevel = degree ? degreeLevel(degree) : 0
    
    return items.filter(r => {
      if (requiredLevel > 0 && degreeLevel(r.degree) < requiredLevel) return false
      if (tiers.length && !tiers.every(t => r.tiers.includes(t))) return false
      if (!matchYears(r.work_years)) return false
      
      // 标签筛选：需要包含所有选中的标签（优先使用 idToTags）
      if (selectedTags.length) {
        const actualTags = idToTags.get(r.id) || r.tags || []
        const resumeTagsLower = actualTags.map(t => t.toLowerCase())
        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
        const hasAllTags = selectedTags.every(tag => {
          const norm = normalize(tag)
          return resumeTagsLower.some(rt => normalize(rt) === norm)
        })
        if (!hasAllTags) return false
      }
      
      return true
    })
  }, [items, idToTags, degree, tiers, yearsBand, selectedTags])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <section className="panel">
      <h2>简历列表</h2>
      <div className="toolbar">
        <div className="bar">
          <input
            placeholder="支持多关键词搜索，如：Java Python 3年 本科"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={() => doSearch()} disabled={loading}>搜索</button>
          {searching && <button className="ghost" onClick={() => { setQuery(''); doSearch('') }}>清空搜索</button>}
        </div>
        <div className="filters-grid">

          <label>
            <span>工作年限</span>
            <select value={uiYearsBand} onChange={e => setUiYearsBand(e.target.value as any)}>
              <option value="不限">不限</option>
              <option value="1年以内">1年以内</option>
              <option value="1-3年">1-3年</option>
              <option value="3-5年">3-5年</option>
              <option value="5-10年">5-10年</option>
              <option value="10年以上">10年以上</option>
            </select>
          </label>

          <label>
            <span>最高学历</span>
            <select value={uiDegree} onChange={e => setUiDegree(e.target.value as any)}>
              <option value="">不限</option>
              <option value="本科">本科</option>
              <option value="硕士">硕士</option>
              <option value="博士">博士</option>
            </select>
          </label>

          <label>
            <span>院校层次</span>
            <div className="chips">
              {uiTiers.map(t => (
                <Chip key={t} text={t} onClose={() => setUiTiers(prev => prev.filter(x => x !== t))} />
              ))}
            </div>
            <div className="grid">
              {(['985','211','双一流','海外留学'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`tag-pick ${uiTiers.includes(t) ? 'selected' : ''}`}
                  onClick={() => toggleTier(t)}
                >{t}</button>
              ))}
            </div>
          </label>
        </div>

        <label>
          <span>标签（点击可多选，点击"应用筛选"生效）</span>
          <div className="chips">
            {uiSelectedTags.map(t => (
              <Chip key={t} text={t} onClose={() => removeTag(t)} />
            ))}
          </div>
          <div className="tag-grid">
            {availableTagsForCategory.map(t => (
              <button 
                key={t} 
                type="button" 
                className={`tag-pick ${uiSelectedTags.includes(t) ? 'selected' : ''}`} 
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {availableTagsForCategory.length === 0 && (
              <div className="muted">暂无可用标签</div>
            )}
          </div>
        </label>

        <div className="bar end">
          <button className="ghost" onClick={resetAll}>清空</button>
          <button className="primary" onClick={applyFilters}>应用筛选</button>
        </div>
      </div>

      <div className="resume-cards">
        {loading && (
          <div className="empty">加载中...</div>
        )}
        {!loading && pageItems.map(item => {
          const displayTags = idToTags.get(item.id) || item.tags || []
          return (
            <div key={item.id} className="resume-card" onClick={() => window.open(`/resumes/${item.id}`, '_blank')}>
              <div className="card-left">
                <div className="name-section">
                  <div className="name">{item.name}</div>
                  <div className="education-info">
                    {Array.isArray(item.schools) && item.schools.length > 0 && (
                      <div className="schools">
                        {item.schools.map((s, i) => (
                          <span key={i} className="school-item">{s}</span>
                        ))}
                      </div>
                    )}
                    {item.degree && (
                      <div className="degree">{item.degree}</div>
                    )}
                  </div>
                </div>
                <div className="meta-info">
                  {item.created_at && (
                    <div className="created-time">
                      录入时间：{String(item.created_at).replace('T',' ').slice(0, 10)}
                    </div>
                  )}
                  {item.work_years !== null && (
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
                        const s = (exp || '').trim()
                        const short = s.length > 80 ? s.slice(0, 80) + '…' : s
                        return (
                          <div key={i} className="experience-item">{short || '-'}</div>
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
                    {displayTags.length ? (
                      displayTags.slice(0, 8).map((t, i) => (
                        <span key={i} className="tag-item">{t}</span>
                      ))
                    ) : (
                      <span className="no-data">无标签</span>
                    )}
                    {displayTags.length > 8 && (
                      <span className="more-tags">+{displayTags.length - 8}</span>
                    )}
                  </div>
                </div>
                
                <div className="tiers-section">
                  <div className="section-title">院校层次</div>
                  <div className="tiers-list">
                    {item.tiers.length > 0 ? (
                      item.tiers.map((t, i) => {
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
              </div>
            </div>
          )
        })}
        {!loading && pageItems.length === 0 && (
          <div className="empty">暂无数据</div>
        )}
      </div>

      <Pagination
        page={currentPage}
        pageSize={pageSize}
        total={total}
        onChange={setPage}
      />
    </section>
  )
}