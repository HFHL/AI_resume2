import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const tabs = [
  { id: 'upload', label: '上传简历' },
  { id: 'resumes', label: '简历' },
  { id: 'positions', label: '职位' },
  { id: 'match', label: '匹配' },
] as const

type TabId = typeof tabs[number]['id']

type PositionView = 'list' | 'create'

type Tag = { id: number; tag_name: string; category: string }

type Keyword = { id: number; keyword: string }

type PositionListItem = {
  id: number
  position_name: string
  position_category: string | null
  tags: string[] | null
  match_type: 'any' | 'all'
  created_at?: string
}

export default function App() {
  const [active, setActive] = useState<TabId>('upload')
  const [positionView, setPositionView] = useState<PositionView>('list')

  return (
    <div className="page">
      <header className="header">
        <div className="brand">AI 简历匹配</div>
        <nav className="nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`nav-item ${active === t.id ? 'active' : ''}`}
              onClick={() => {
                setActive(t.id)
                if (t.id !== 'positions') setPositionView('list')
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {active === 'upload' && (
          <section className="panel">
            <h2>上传简历</h2>
            <div className="upload">
              <label className="upload-card">
                <input type="file" accept=".pdf,.doc,.docx,.txt" hidden />
                <span className="upload-icon">＋</span>
                <span className="upload-text">点击或拖拽文件到此处</span>
              </label>
            </div>
          </section>
        )}

        {active === 'resumes' && (
          <section className="panel">
            <h2>简历</h2>
            <p className="muted">这里将展示已上传的简历列表。</p>
          </section>
        )}

        {active === 'positions' && (
          <section className="panel">
            {positionView === 'list' && (
              <PositionsList onCreate={() => setPositionView('create')} />
            )}
            {positionView === 'create' && (
              <PositionCreate onBack={() => setPositionView('list')} />
            )}
          </section>
        )}

        {active === 'match' && (
          <section className="panel">
            <h2>匹配</h2>
            <p className="muted">在此执行职位与简历的匹配分析。</p>
          </section>
        )}
      </main>

      <footer className="footer">© {new Date().getFullYear()} AI Resume</footer>
    </div>
  )
}

function usePositions() {
  const [items, setItems] = useState<PositionListItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch('http://localhost:8000/positions')
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false))
  }, [])
  return { items, loading }
}

function PositionsList({ onCreate }: { onCreate: () => void }) {
  const { items, loading } = usePositions()
  return (
    <div>
      <h2>职位</h2>
      <p className="muted">管理职位与关键字配置。</p>
      <div style={{ height: 12 }} />
      <button className="primary big" onClick={onCreate}>＋ 新增职位</button>

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
    </div>
  )
}

function PositionCreate({ onBack }: { onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [category, setCategory] = useState<'技术类' | '非技术类'>('技术类')
  const [tags, setTags] = useState<Tag[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allKeywords, setAllKeywords] = useState<Keyword[]>([])

  const [form, setForm] = useState({
    position_name: '',
    position_description: '',
    match_type: 'any',
  })

  // 拉取标签与关键词
  useEffect(() => {
    fetch(`http://localhost:8000/tags?category=${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then(d => setAllTags(d.items || []))
      .catch(() => setAllTags([]))
  }, [category])

  useEffect(() => {
    fetch('http://localhost:8000/keywords')
      .then(r => r.json())
      .then(d => setAllKeywords(d.items || []))
      .catch(() => setAllKeywords([]))
  }, [])

  const availableKeywords = useMemo(
    () => allKeywords.filter(k => !keywords.some(s => s.id === k.id)),
    [allKeywords, keywords]
  )

  function isTagSelected(tag: Tag) {
    return tags.some(t => t.id === tag.id)
  }
  function toggleTag(tag: Tag) {
    setTags(prev => (prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag]))
  }
  function removeTag(id: number) {
    setTags(prev => prev.filter(t => t.id !== id))
  }
  function addKeyword(k: Keyword) {
    setKeywords(prev => (prev.some(x => x.id === k.id) ? prev : [...prev, k]))
  }
  function removeKeyword(id: number) {
    setKeywords(prev => prev.filter(k => k.id !== id))
  }

  async function createKeywordInline(text: string) {
    const kw = text.trim()
    if (!kw) return
    try {
      const res = await fetch('http://localhost:8000/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
      })
      if (!res.ok) throw new Error('创建关键词失败')
      const data = await res.json()
      const item = data.keyword as Keyword
      setAllKeywords(prev => (prev.some(p => p.id === item.id) ? prev : [...prev, item]))
      addKeyword(item)
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        position_name: form.position_name.trim(),
        position_description: form.position_description.trim() || null,
        position_category: category,
        required_keywords: keywords.map(k => k.keyword),
        match_type: form.match_type as 'any' | 'all',
        tags: tags.map(t => t.tag_name),
      }

      const res = await fetch('http://localhost:8000/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '创建职位失败')
      }

      onBack()
      alert('创建成功')
    } catch (err: any) {
      alert(err.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <div className="bar">
        <button className="ghost" onClick={onBack}>← 返回</button>
        <div style={{ flex: 1 }} />
      </div>

      <h2>新增职位</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          <span>职位名称</span>
          <input value={form.position_name} onChange={e => set('position_name', e.target.value)} placeholder="如：前端工程师" required />
        </label>

        <label>
          <span>职位描述</span>
          <textarea value={form.position_description} onChange={e => set('position_description', e.target.value)} rows={4} placeholder="该职位的主要职责..." />
        </label>

        <div className="row">
          <label>
            <span>职位类别</span>
            <div className="seg">
              <button type="button" className={`seg-item ${category === '技术类' ? 'active' : ''}`} onClick={() => setCategory('技术类')}>技术类</button>
              <button type="button" className={`seg-item ${category === '非技术类' ? 'active' : ''}`} onClick={() => setCategory('非技术类')}>非技术类</button>
            </div>
          </label>
          <label>
            <span>匹配方式</span>
            <select value={form.match_type} onChange={e => set('match_type', e.target.value)}>
              <option value="any">关键词命中任一</option>
              <option value="all">需要全部命中</option>
            </select>
          </label>
        </div>

        <label>
          <span>标签（点击可添加/取消；选中汇总显示在上方，可点 × 取消）</span>
          <div className="chips">
            {tags.map(t => (
              <Chip key={t.id} text={t.tag_name} onClose={() => removeTag(t.id)} />
            ))}
          </div>
          <div className="tag-grid">
            {allTags.map(t => {
              const selected = isTagSelected(t)
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tag-pick ${selected ? 'selected' : ''}`}
                  onClick={() => toggleTag(t)}
                >
                  {t.tag_name}
                </button>
              )
            })}
            {allTags.length === 0 && (
              <div className="muted">该类别下暂无标签</div>
            )}
          </div>
        </label>

        <label>
          <span>关键词（点击选择/取消；选中汇总显示在上方，可回车新增）</span>
          <div className="chips">
            {keywords.map(k => (
              <Chip key={k.id} text={k.keyword} onClose={() => removeKeyword(k.id)} />
            ))}
          </div>
          <KeywordPicker
            options={allKeywords}
            selected={keywords}
            onPick={addKeyword}
            onRemove={(id) => removeKeyword(id)}
            onCreate={createKeywordInline}
          />
        </label>

        <div className="bar end">
          <button className="ghost" type="button" onClick={onBack}>取消</button>
          <button className="primary" disabled={submitting}>
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Chip({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <span className="chip">
      {text}
      <button 
        type="button" 
        className="chip-close" 
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
    </span>
  )
}

function KeywordPicker({ options, selected, onPick, onRemove, onCreate }: {
  options: Keyword[]
  selected: Keyword[]
  onPick: (k: Keyword) => void
  onRemove: (id: number) => void
  onCreate: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter(o => o.keyword.toLowerCase().includes(q)) : options
    return list.slice(0, 30)
  }, [options, query])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const text = query.trim()
      if (text) {
        onCreate(text)
        setQuery('')
      }
    }
  }

  return (
    <div>
      <input
        placeholder="输入关键词并回车新增，或从下方选择"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="grid">
        {filtered.map(k => {
          const isSelected = selected.some(s => s.id === k.id)
          return (
            <button
              key={k.id}
              type="button"
              className={`tag-pick ${isSelected ? 'selected' : ''}`}
              onClick={() => (isSelected ? onRemove(k.id) : onPick(k))}
            >
              {k.keyword}
            </button>
          )
        })}
        {filtered.length === 0 && <div className="muted">无匹配关键词，可回车新增</div>}
      </div>
    </div>
  )
}
