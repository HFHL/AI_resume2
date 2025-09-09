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
  degree: '' | '专科' | '本科' | '硕士' | '博士'
  tiers: Array<'985' | '211' | '双一流' | '海外留学' | '专科'>
  schools?: string[]
  created_at?: string
  work_experience?: string[]
  uploaded_by?: string | null
  work_experience_struct?: Array<{ start?: string | null; end?: string | null; company?: string | null; title?: string | null }>
  project_experience_struct?: Array<{ start?: string | null; end?: string | null; company?: string | null; title?: string | null }>
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
  const [positionQuery, setPositionQuery] = useState('')
  const [positionSuggestions, setPositionSuggestions] = useState<Array<{ id: number; position_name: string }>>([])
  const [selectedPosition, setSelectedPosition] = useState<{ id: number; position_name: string } | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [idToTags, setIdToTags] = useState<Map<number, string[]>>(new Map())
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  
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
    const url = api('/resumes?limit=all&offset=0')
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
          if (s.includes('专')) return '专科'
          if (s.includes('大专')) return '专科'
          return ''
        }
        
        const normalizeTiers = (arr: string[] | null | undefined): ResumeItem['tiers'] => {
          const mapped = (arr || []).map(t => {
            const v = t.replace('海外', '海外留学')
            return v as ResumeItem['tiers'][number]
          }).filter(v => ['985','211','双一流','海外留学','专科'].includes(v)) as ResumeItem['tiers']
          return Array.from(new Set(mapped)) as ResumeItem['tiers']
        }

        const mapped: ResumeItem[] = rows.map(r => {
          const externalTags = idToTags.get(r.id) || []
          const fallbackTags = (r.tag_names || [])
          const tagNames = (externalTags.length ? externalTags : fallbackTags).map(s => s.trim()).filter(Boolean)
          
          const wxs = (r as any).work_experience_struct as Array<any> | undefined
          const pxs = (r as any).project_experience_struct as Array<any> | undefined
          const deg = normalizeDegree(r.education_degree)
          let trs = normalizeTiers(r.education_tiers)
          if (deg === '专科' && !trs.includes('专科')) trs = [...trs, '专科'] as ResumeItem['tiers']
          return {
            id: r.id,
            name: r.name || '未知',
            tags: tagNames,
            tag_names: tagNames,
            work_years: r.work_years,
            degree: deg,
            tiers: trs,
            schools: (r.education_school || undefined) as any,
            created_at: (r as any).created_at || undefined,
            work_experience: (r as any).work_experience || [],
            uploaded_by: (r as any).uploaded_by ?? null,
            work_experience_struct: Array.isArray(wxs) ? wxs : undefined,
            project_experience_struct: Array.isArray(pxs) ? pxs : undefined,
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
        const url = api('/resumes?limit=all&offset=0')
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
        let mapped = mapRows(rows, idToTags, allTags)
        // 职位筛选：
        const posWordRaw = (selectedPosition?.position_name || positionQuery || '').trim()
        const posWord = posWordRaw.toLowerCase()
        // 若选择了职位，则与职位匹配结果求交集（基于配置的 required_keywords）
        if (selectedPosition) {
          try {
            const matchUrl = api(`/positions/${selectedPosition.id}/match`)
            console.log('[ResumesPage] Fetch position match (reset):', matchUrl)
            const mr = await fetch(matchUrl)
            const md = await mr.json().catch(() => ({ items: [] }))
            const idSet = new Set<number>((md.items || []).map((x: any) => x.id))
            mapped = mapped.filter(x => idSet.has(x.id))
          } catch (e) {
            console.warn('职位匹配请求失败（reset）: ', e)
          }
        }
        // 无论是否选择职位，只要职位输入框有词，都用职位标题二次过滤
        if (posWord) {
          const cleanupTitle = (s: string) => {
            let t = String(s || '')
            t = t.replace(/[\t]+/g, ' ').replace(/\s+/g, ' ').trim()
            t = t.replace(/^(?:职位|岗位|职务)[:：]\s*/g, '')
            t = t.replace(/(负责|参与|主要|带领|领导|完成|进行).*/g, '')
            return t.trim()
          }
          const extractTitlesFromTextLine = (line: string): string[] => {
            const src = String(line || '')
            const titles: string[] = []
            const patterns: RegExp[] = [
              /^\s*\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?\s*[-~—–到至]\s*(?:\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?|至今|现在|Present)\s+.+?\s{2,}(.+?)\s*$/i,
              /公司[:：]\s*.+?\s+(?:职位|岗位|职务)[:：]\s*([^\n]+)/i,
              /^\s*.+?\s*[|｜/·•]\s*([^\n]+)$/,
              /^\s*.+?\s{2,}([^\n]+)$/,
            ]
            for (const re of patterns) {
              const m = src.match(re)
              if (m && m[1]) titles.push(cleanupTitle(m[1]))
            }
            return Array.from(new Set(titles.filter(Boolean)))
          }
          const getAllTitles = (r: any): string[] => {
            const acc: string[] = []
            const wxs = Array.isArray(r.work_experience_struct) ? r.work_experience_struct : []
            for (const it of wxs) { if (it && (it as any).title) acc.push(cleanupTitle((it as any).title)) }
            const lines: string[] = Array.isArray(r.work_experience) ? r.work_experience as any : []
            for (const ln of lines) acc.push(...extractTitlesFromTextLine(ln))
            return Array.from(new Set(acc.filter(Boolean)))
          }
          mapped = mapped.filter(row => {
            const titles = getAllTitles(row).map(s => s.toLowerCase())
            return titles.some(t => t.includes(posWord))
          })
        }
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
      const searchUrl = api(`/resumes?q=${encodeURIComponent(q)}&limit=all&offset=0`)
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
      let mapped = mapRows(rows, idToTags, allTags)
      // 职位筛选：
      const posWordRaw = (selectedPosition?.position_name || positionQuery || '').trim()
      const posWord = posWordRaw.toLowerCase()
      // 若选择了职位，则与职位匹配结果求交集（基于配置的 required_keywords）
      if (selectedPosition) {
        try {
          const matchUrl = api(`/positions/${selectedPosition.id}/match`)
          console.log('[ResumesPage] Fetch position match (search):', matchUrl)
          const mr = await fetch(matchUrl)
          const md = await mr.json().catch(() => ({ items: [] }))
          const idSet = new Set<number>((md.items || []).map((x: any) => x.id))
          mapped = mapped.filter(x => idSet.has(x.id))
        } catch (e) {
          console.warn('职位匹配请求失败（search）: ', e)
        }
      }
      // 无论是否选择职位，只要职位输入框有词，都用职位标题二次过滤
      if (posWord) {
        const cleanupTitle = (s: string) => {
          let t = String(s || '')
          t = t.replace(/[\t]+/g, ' ').replace(/\s+/g, ' ').trim()
          t = t.replace(/^(?:职位|岗位|职务)[:：]\s*/g, '')
          t = t.replace(/(负责|参与|主要|带领|领导|完成|进行).*/g, '')
          return t.trim()
        }
        const extractTitlesFromTextLine = (line: string): string[] => {
          const src = String(line || '')
          const titles: string[] = []
          const patterns: RegExp[] = [
            /^\s*\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?\s*[-~—–到至]\s*(?:\d{2,4}(?:[./年-]\d{1,2}(?:[./-]\d{1,2})?)?|至今|现在|Present)\s+.+?\s{2,}(.+?)\s*$/i,
            /公司[:：]\s*.+?\s+(?:职位|岗位|职务)[:：]\s*([^\n]+)/i,
            /^\s*.+?\s*[|｜/·•]\s*([^\n]+)$/,
            /^\s*.+?\s{2,}([^\n]+)$/,
          ]
          for (const re of patterns) {
            const m = src.match(re)
            if (m && m[1]) titles.push(cleanupTitle(m[1]))
          }
          return Array.from(new Set(titles.filter(Boolean)))
        }
        const getAllTitles = (r: any): string[] => {
          const acc: string[] = []
          const wxs = Array.isArray(r.work_experience_struct) ? r.work_experience_struct : []
          for (const it of wxs) { if (it && (it as any).title) acc.push(cleanupTitle((it as any).title)) }
          const lines: string[] = Array.isArray(r.work_experience) ? r.work_experience as any : []
          for (const ln of lines) acc.push(...extractTitlesFromTextLine(ln))
          return Array.from(new Set(acc.filter(Boolean)))
        }
        mapped = mapped.filter(row => {
          const titles = getAllTitles(row).map(s => s.toLowerCase())
          return titles.some(t => t.includes(posWord))
        })
      }
      console.log('[ResumesPage] mapped first3 (search):', mapped.slice(0, 3))
      setItems(mapped)
    } catch (error) {
      console.error('Search error:', error)
      alert('搜索失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  // 职位输入建议（简单实时查询）
  useEffect(() => {
    const q = positionQuery.trim()
    if (!q || selectedPosition) { setPositionSuggestions([]); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const url = api(`/positions?q=${encodeURIComponent(q)}`)
        const r = await fetch(url, { signal: ctrl.signal })
        const d = await r.json().catch(() => ({ items: [] }))
        const arr = Array.isArray(d?.items) ? d.items : []
        setPositionSuggestions(arr.map((x: any) => ({ id: x.id, position_name: x.position_name })))
      } catch {
        setPositionSuggestions([])
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [positionQuery, selectedPosition])

  function mapRows(
    rows: Array<{ id:number; name:string|null; tag_names?:string[]|null; education_degree:string|null; education_tiers:string[]|null; education_school?: string[] | null; work_years:number|null; created_at?: string | null; work_experience?: string[] | null; work_experience_struct?: any[] | null; project_experience_struct?: any[] | null }>,
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

      const wxs = (r as any).work_experience_struct as Array<any> | undefined
      const pxs = (r as any).project_experience_struct as Array<any> | undefined
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
        uploaded_by: (r as any).uploaded_by ?? null,
        work_experience_struct: Array.isArray(wxs) ? wxs : undefined,
        project_experience_struct: Array.isArray(pxs) ? pxs : undefined,
      }
    })
  }

  // 应用到列表的筛选（按"应用筛选"按钮后生效）
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [yearsBand, setYearsBand] = useState<'不限' | '1年以内' | '1-3年' | '3-5年' | '5-10年' | '10年以上'>('不限')
  const [degree, setDegree] = useState<'' | '专科' | '本科' | '硕士' | '博士'>('')
  const [tiers, setTiers] = useState<Array<'985' | '211' | '双一流' | '海外留学' | '专科'>>([])
  const [page, setPage] = useState(1)
  const [minTenureYears, setMinTenureYears] = useState<number | ''>('')

  // UI 中待编辑的筛选（实时变更，不立即生效）
  const [uiSelectedTags, setUiSelectedTags] = useState<string[]>(selectedTags)
  const [uiYearsBand, setUiYearsBand] = useState<typeof yearsBand>(yearsBand)
  const [uiDegree, setUiDegree] = useState<typeof degree>(degree)
  const [uiTiers, setUiTiers] = useState<typeof tiers>(tiers)
  const [uiMinTenureYears, setUiMinTenureYears] = useState<number | ''>('')
  const pageSize = 12
  const [tagsExpanded, setTagsExpanded] = useState(false)

  // 获取所有可用的标签
  const tagsByCategory = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const t of allTags) {
      const cat = (t.category || '未分类') as string
      const arr = map.get(cat) || []
      arr.push(t.tag_name)
      map.set(cat, arr)
    }
    return Array.from(map.entries()) as Array<[string, string[]]>
  }, [allTags])

  function resetAll() {
    setUiSelectedTags([])
    setUiYearsBand('不限')
    setUiDegree('')
    setUiTiers([])
    setUiMinTenureYears('')
  }

  function applyFilters() {
    setSelectedTags(uiSelectedTags)
    setYearsBand(uiYearsBand)
    setDegree(uiDegree)
    setTiers(uiTiers)
    setMinTenureYears(uiMinTenureYears)
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

  // 预计算：基于最早 start 得到“起始至今工龄(年)”
  const tenureById = useMemo(() => {
    const map = new Map<number, number | null>()
    const now = new Date()
    const msPerYear = 365.25 * 24 * 3600 * 1000
    const parseStart = (raw: string | null | undefined): Date | null => {
      const s = (raw || '').trim()
      if (!s) return null
      // 支持: YYYY, YYYY-MM, YYYY/MM, YYYY.MM, YYYY年MM月, YYYY年
      const m = s.match(/^\s*(\d{4})(?:[./-年\s]?(\d{1,2}))?/)
      if (!m) return null
      const y = Number(m[1])
      const mm = m[2] ? Number(m[2]) : 1
      if (!Number.isFinite(y)) return null
      const d = new Date(Date.UTC(y, Math.max(0, Math.min(11, mm - 1)), 1))
      return isNaN(d.getTime()) ? null : d
    }
    for (const r of items) {
      const wxs = Array.isArray(r.work_experience_struct) ? r.work_experience_struct : []
      const starts: Date[] = []
      for (const it of wxs) {
        const d = parseStart((it as any)?.start)
        if (d) starts.push(d)
      }
      if (starts.length === 0) { map.set(r.id, null); continue }
      let earliest = starts[0]
      for (const d of starts) { if (d < earliest) earliest = d }
      const years = Math.floor((now.getTime() - earliest.getTime()) / msPerYear)
      map.set(r.id, years >= 0 ? years : 0)
    }
    return map
  }, [items])

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
      // 起始至今工龄（年）下限
      if (minTenureYears !== '' && Number.isFinite(Number(minTenureYears))) {
        const threshold = Number(minTenureYears)
        const computed = tenureById.get(r.id)
        if (computed !== null && computed !== undefined) {
          if (computed < threshold) return false
        } else {
          const approx = r.work_years
          if (approx === null || approx < threshold) return false
        }
      }
      
      return true
    })
  }, [items, idToTags, degree, tiers, yearsBand, selectedTags, minTenureYears, tenureById])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const selectedSet = useMemo(() => new Set<number>(selectedIds), [selectedIds])
  const isPageAllSelected = useMemo(() => pageItems.length > 0 && pageItems.every(it => selectedSet.has(it.id)), [pageItems, selectedSet])

  const isAdmin = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem('auth_user') || 'null')
      return Boolean(user?.is_admin)
    } catch {
      return false
    }
  }, [])

  function toggleSelectOne(id: number, checked: boolean) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (checked) s.add(id)
      else s.delete(id)
      return Array.from(s)
    })
  }

  function toggleSelectAllCurrentPage(nextChecked?: boolean) {
    const target = typeof nextChecked === 'boolean' ? nextChecked : !isPageAllSelected
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (target) {
        for (const it of pageItems) s.add(it.id)
      } else {
        for (const it of pageItems) s.delete(it.id)
      }
      return Array.from(s)
    })
  }

  function clearSelection() {
    setSelectedIds([])
  }

  async function bulkDelete() {
    if (!isAdmin) {
      alert('仅管理员可删除简历')
      return
    }
    const ids = selectedIds.slice()
    if (ids.length === 0) {
      alert('请先选择要删除的简历')
      return
    }
    if (!confirm(`确定删除选中的 ${ids.length} 份简历吗？`)) return
    try {
      const r = await fetch(api('/resumes/bulk_delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': 'true' },
        body: JSON.stringify({ ids })
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({ detail: '删除失败' }))
        alert(d?.detail || '删除失败')
        return
      }
      const d = await r.json().catch(() => ({ ok: true, deletedIds: ids }))
      const deletedIds: number[] = Array.isArray(d?.deletedIds) ? d.deletedIds : ids
      const delSet = new Set<number>(deletedIds)
      setItems(prev => prev.filter(it => !delSet.has(it.id)))
      setSelectedIds(prev => prev.filter(id => !delSet.has(id)))
      alert(`已删除 ${deletedIds.length} 条`)
    } catch (e) {
      alert('删除失败，请稍后重试')
    }
  }

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
            style={{ flex: 1, fontSize: 18, padding: '14px 18px', height: 56, borderRadius: 10 }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              placeholder="职位（如：产品）"
              value={selectedPosition ? selectedPosition.position_name : positionQuery}
              onChange={e => { setSelectedPosition(null); setPositionQuery(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
              style={{ width: 420, marginLeft: 8, fontSize: 18, padding: '14px 18px', height: 56, borderRadius: 10 }}
            />
            {!!selectedPosition && (
              <button className="ghost" style={{ marginLeft: 6 }} onClick={() => { setSelectedPosition(null); setPositionQuery('') }}>清空职位</button>
            )}
            {(!selectedPosition && positionSuggestions.length > 0) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', zIndex: 2 }}>
                {positionSuggestions.slice(0, 8).map(opt => (
                  <div
                    key={opt.id}
                    onClick={() => { setSelectedPosition(opt); setPositionQuery(''); setPositionSuggestions([]) }}
                    style={{ padding: '6px 8px', cursor: 'pointer' }}
                  >{opt.position_name}</div>
                ))}
              </div>
            )}
          </div>
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
              {(['985','211','双一流','海外留学','专科'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`tag-pick ${uiTiers.includes(t) ? 'selected' : ''}`}
                  onClick={() => toggleTier(t)}
                >{t}</button>
              ))}
            </div>
          </label>

          <label>
            <span>毕业时长（年，最低）</span>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="例如：30"
              value={uiMinTenureYears}
              onChange={e => {
                const v = e.target.value
                if (v === '') { setUiMinTenureYears(''); return }
                const n = Number(v)
                if (Number.isFinite(n) && n >= 0) setUiMinTenureYears(Math.floor(n))
              }}
            />
          </label>
        </div>

        <div>
          <div className="bar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>标签（按类别分组，点击可多选；点击"应用筛选"生效）</span>
            <button className="ghost" type="button" onClick={() => setTagsExpanded(v => !v)}>
              {tagsExpanded ? '收起标签筛选' : '展开标签筛选'}
            </button>
          </div>
          <div className="chips">
            {uiSelectedTags.map(t => (
              <Chip key={t} text={t} onClose={() => removeTag(t)} />
            ))}
            {uiSelectedTags.length === 0 && <span className="muted">未选择任何标签</span>}
          </div>
          {tagsExpanded && (
            <>
              {tagsByCategory.length === 0 && (
                <div className="muted">暂无可用标签</div>
              )}
              {tagsByCategory.map(([cat, names]) => (
                <div key={cat} style={{ marginTop: 8 }}>
                  <div className="section-title">{cat}</div>
                  <div className="tag-grid">
                    {names.map(t => (
                      <button
                        key={`${cat}::${t}`}
                        type="button"
                        className={`tag-pick ${uiSelectedTags.includes(t) ? 'selected' : ''}`}
                        onClick={() => toggleTag(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="bar end">
          <button className="ghost" onClick={resetAll}>清空</button>
          <button className="primary" onClick={applyFilters}>应用筛选</button>
        </div>
      </div>

      <div className="bar" style={{ alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={isPageAllSelected} onChange={e => toggleSelectAllCurrentPage(e.target.checked)} />
          <span>全选当前页</span>
        </label>
        <span className="muted">已选 {selectedIds.length} 条</span>
        <div style={{ flex: 1 }} />
        <button className="ghost" onClick={clearSelection} disabled={selectedIds.length === 0}>清空选择</button>
        <button className="danger" onClick={bulkDelete} disabled={!isAdmin || selectedIds.length === 0}>批量删除</button>
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
                <div onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(item.id)}
                    onChange={e => toggleSelectOne(item.id, e.target.checked)}
                    title="选择此简历"
                  />
                </div>
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
                  <div className="uploader">上传者：{item.uploaded_by || '-'}</div>
                </div>
              </div>
              
              <div className="card-center">
                <div className="work-experience">
                  <div className="section-title">工作经历</div>
                  {(() => {
                    const wx = Array.isArray(item.work_experience_struct) ? item.work_experience_struct : []
                    const px = Array.isArray(item.project_experience_struct) ? item.project_experience_struct : []
                    const merged = [...wx, ...px].filter(Boolean)
                    return merged.length > 0 ? (
                    <div className="experience-list">
                      {merged.slice(0, 3).map((wx, i) => {
                        const start = (wx as any)?.start || ''
                        const end = (wx as any)?.end || ''
                        const time = start ? `${start} - ${end || '至今'}` : ''
                        const company = (wx as any)?.company || ''
                        const title = (wx as any)?.title || ''
                        return (
                          <div key={i} className="experience-item">
                            {time && <span className="time">{time} </span>}
                            {company && <span className="hl-company">{company}</span>}{company && title ? ' ' : ''}
                            {title && <span className="hl-role">{title}</span>}
                          </div>
                        )
                      })}
                      {merged.length > 3 && (
                        <div className="more-indicator">还有 {merged.length - 3} 条经历...</div>
                      )}
                    </div>
                    ) : (
                      <div className="no-data">暂无工作经历</div>
                    )
                  })()}
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