import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Chip from '../components/Chip'
import KeywordPicker, { type Keyword } from '../components/KeywordPicker'

type Tag = { id: number; tag_name: string; category: string }

export default function PositionCreatePage() {
  const navigate = useNavigate()
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

      navigate('/positions')
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

  function onBack() {
    navigate('/positions')
  }

  return (
    <section className="panel">
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
    </section>
  )
}