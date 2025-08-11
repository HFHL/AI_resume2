import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Chip from '../components/Chip'
import Pagination from '../components/Pagination'

type ResumeItem = {
  id: number
  name: string
  category: '技术类' | '非技术类'
  tags: string[]
  years: number | null
  degree: '' | '本科' | '硕士' | '博士'
  tiers: Array<'985' | '211' | '双一流' | '海外留学'>
}

type Tag = {
  id: number
  tag_name: string
  category: string
}

export default function ResumesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ResumeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [techTags, setTechTags] = useState<Tag[]>([])
  const [nonTechTags, setNonTechTags] = useState<Tag[]>([])
  
  // 获取标签数据
  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8000/tags?category=技术类').then(r => r.json()),
      fetch('http://localhost:8000/tags?category=非技术类').then(r => r.json())
    ]).then(([techData, nonTechData]) => {
      setTechTags(techData.items || [])
      setNonTechTags(nonTechData.items || [])
    }).catch(() => {
      setTechTags([])
      setNonTechTags([])
    })
  }, [])
  
  useEffect(() => {
    setLoading(true)
    fetch('http://localhost:8000/resumes')
      .then(r => r.json())
      .then((d) => {
        const rows = (d.items || []) as Array<{
          id: number
          name: string | null
          skills: string[] | null
          education_degree: string | null
          education_tiers: string[] | null
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
        
        // 判断是否为技术类（基于技能标签）
        const hasTech = (skills: string[] | null | undefined) => {
          if (!skills || skills.length === 0) return false
          // 技术相关的关键词
          const techKeywords = ['前端', '后端', '全栈', '算法', '数据', '测试', '运维', '移动端',
            'Java', 'Python', 'Go', 'C++', 'TypeScript', 'React', 'Vue', 'Node.js', '大模型', 'NLP',
            'AI', 'ML', 'DevOps', 'Android', 'iOS', 'PHP', 'Ruby', 'Rust', 'Swift', 'Kotlin']
          const skillsStr = skills.join('、').toLowerCase()
          return techKeywords.some(keyword => skillsStr.includes(keyword.toLowerCase()))
        }
        
        const mapped: ResumeItem[] = rows.map(r => {
          const skills = (r.skills || []).map(s => s.trim()).filter(Boolean)
          const isTech = hasTech(r.skills)
          
          return {
            id: r.id,
            name: r.name || '未知',
            category: isTech ? '技术类' : '非技术类',
            tags: skills,
            years: null,
            degree: normalizeDegree(r.education_degree),
            tiers: normalizeTiers(r.education_tiers),
          }
        })
        
        setItems(mapped)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  // 应用到列表的筛选（按"应用筛选"按钮后生效）
  const [category, setCategory] = useState<'技术类' | '非技术类'>('技术类')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [yearsBand, setYearsBand] = useState<'不限' | '1年以内' | '1-3年' | '3-5年' | '5-10年' | '10年以上'>('不限')
  const [degree, setDegree] = useState<'' | '本科' | '硕士' | '博士'>('')
  const [tiers, setTiers] = useState<Array<'985' | '211' | '双一流' | '海外留学'>>([])
  const [page, setPage] = useState(1)

  // UI 中待编辑的筛选（实时变更，不立即生效）
  const [uiCategory, setUiCategory] = useState<typeof category>(category)
  const [uiSelectedTags, setUiSelectedTags] = useState<string[]>(selectedTags)
  const [uiYearsBand, setUiYearsBand] = useState<typeof yearsBand>(yearsBand)
  const [uiDegree, setUiDegree] = useState<typeof degree>(degree)
  const [uiTiers, setUiTiers] = useState<typeof tiers>(tiers)
  const pageSize = 12

  // 根据当前选择的类别，获取可用的标签
  const availableTagsForCategory = useMemo(() => {
    if (uiCategory === '技术类') {
      return techTags.map(t => t.tag_name)
    } else {
      return nonTechTags.map(t => t.tag_name)
    }
  }, [uiCategory, techTags, nonTechTags])

  function resetAll() {
    setUiCategory('技术类')
    setUiSelectedTags([])
    setUiYearsBand('不限')
    setUiDegree('')
    setUiTiers([])
  }

  function applyFilters() {
    setCategory(uiCategory)
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

  // 切换类别时，清空已选标签
  function switchCategory(next: '技术类' | '非技术类') {
    setUiCategory(next)
    setUiSelectedTags([])
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
      if (r.category !== category) return false
      if (requiredLevel > 0 && degreeLevel(r.degree) < requiredLevel) return false
      if (tiers.length && !tiers.every(t => r.tiers.includes(t))) return false
      if (!matchYears(r.years)) return false
      
      // 标签筛选：需要包含所有选中的标签
      if (selectedTags.length) {
        const resumeTagsLower = r.tags.map(t => t.toLowerCase())
        const hasAllTags = selectedTags.every(tag => 
          resumeTagsLower.some(rt => rt === tag.toLowerCase())
        )
        if (!hasAllTags) return false
      }
      
      return true
    })
  }, [items, category, degree, tiers, yearsBand, selectedTags])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <section className="panel">
      <h2>简历列表</h2>
      <div className="toolbar">
        <div className="filters-grid">
          <label>
            <span>职位类别</span>
            <div className="seg">
              <button type="button" className={`seg-item ${uiCategory === '技术类' ? 'active' : ''}`} onClick={() => switchCategory('技术类')}>技术类</button>
              <button type="button" className={`seg-item ${uiCategory === '非技术类' ? 'active' : ''}`} onClick={() => switchCategory('非技术类')}>非技术类</button>
            </div>
          </label>

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
          <span>{uiCategory === '技术类' ? '技术标签' : '标签'}（点击可多选，点击"应用筛选"生效）</span>
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

      <div className="data-table">
        <div className="table-head">
          <div>姓名</div>
          <div>标签</div>
          <div className="hide-on-narrow">信息</div>
        </div>
        {loading && (
          <div className="empty">加载中...</div>
        )}
        {!loading && pageItems.map(item => (
          <div key={item.id} className="table-row clickable" onClick={() => navigate(`/resumes/${item.id}`)}>
            <div className="cell-name">
              <div className="name">{item.name}</div>
              <div className="muted small">{item.category}</div>
            </div>
            <div className="cell-tags">
              <div className="card-tags">
                {item.tags.length ? item.tags.map((t, i) => (
                  <span key={i} className="pill">{t}</span>
                )) : <span className="muted">无标签</span>}
              </div>
            </div>
            <div className="cell-meta hide-on-narrow">
              {item.degree && <span className="pill muted">{item.degree}</span>}
              {item.years !== null && <span className="pill muted">{item.years}年</span>}
              {item.tiers.map((t, i) => (
                <span key={i} className="pill muted">{t}</span>
              ))}
            </div>
          </div>
        ))}
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