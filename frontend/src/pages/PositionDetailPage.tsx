import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

type Tag = { id: number; tag_name: string; category: string }

type Keyword = { id: number; keyword: string }

type Position = {
  id: number
  position_name: string
  position_description: string | null
  position_category: string | null
  required_keywords: string[] | null
  match_type: 'any' | 'all'
  tags: string[] | null
}

export default function PositionDetail() {
  const params = useParams()
  const id = Number(params.id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)

  const [category, setCategory] = useState<string>('')
  const [tags, setTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of allTags) { if (t.category) set.add(t.category) }
    return Array.from(set)
  }, [allTags])

  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [allKeywords, setAllKeywords] = useState<Keyword[]>([])

  useEffect(() => {
    setLoading(true)
    const url = api(`/positions/${id}`)
    console.log('[PositionDetailPage] fetch detail', url)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 10000)
    fetch(url, { signal: controller.signal })
      .then(async r => {
        clearTimeout(t)
        if (!r.ok) {
          const detail = await r.text().catch(() => '')
          throw new Error(detail || '加载失败')
        }
        return r.json()
      })
      .then(d => {
        const p: Position = d.item
        setPosition(p)
        setCategory((p.position_category as any) || '技术类')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetch(api(`/tags`))
      .then(r => r.json())
      .then(d => setAllTags(d.items || []))
      .catch(() => setAllTags([]))
  }, [])

  useEffect(() => {
    fetch(api('/keywords'))
      .then(r => r.json())
      .then(d => setAllKeywords(d.items || []))
      .catch(() => setAllKeywords([]))
  }, [])

  // 初始化选中标签与关键词
  useEffect(() => {
    if (!position) return
    const tagSet = new Set(position.tags || [])
    setTags(prev => {
      const merged = allTags.filter(t => tagSet.has(t.tag_name))
      return merged
    })
    const kwSet = new Set(position.required_keywords || [])
    setKeywords(prev => {
      const merged = allKeywords
        .filter(k => kwSet.has(k.keyword))
        .map(k => ({ id: k.id, keyword: k.keyword }))
      return merged
    })
  }, [position, allTags, allKeywords])

  function isTagSelected(tag: Tag) { return tags.some(t => t.id === tag.id) }
  function toggleTag(tag: Tag) {
    setTags(prev => (prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag]))
  }
  function removeTag(id: number) { setTags(prev => prev.filter(t => t.id !== id)) }

  function addKeyword(k: Keyword) { setKeywords(prev => (prev.some(x => x.id === k.id) ? prev : [...prev, k])) }
  function removeKeyword(id: number) { setKeywords(prev => prev.filter(k => k.id !== id)) }

  async function save() {
    if (!position) return
    setSaving(true)
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
      const isAdmin = !!(user && user.is_admin)
      const payload = {
        position_name: position.position_name,
        position_description: position.position_description,
        position_category: category,
        match_type: position.match_type,
        required_keywords: keywords.map(k => k.keyword),
        tags: tags.map(t => t.tag_name),
      }
      const res = await fetch(api(`/positions/${position.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin': isAdmin ? 'true' : 'false' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let msg = '保存失败'
        try { const d = await res.json(); if (d?.detail) msg = d.detail } catch {}
        throw new Error(msg)
      }
      alert('已保存')
    } catch (e: any) {
      alert(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !position) {
    return (
      <div className="main">
        <div className="panel">
          <div className="bar">
            <Link to="/" className="ghost">← 返回</Link>
          </div>
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="main">
      <div className="panel">
        <div className="bar">
          <Link to="/" className="ghost">← 返回</Link>
          <div style={{ flex: 1 }} />
          {(() => {
            let u: any = null
            try { u = JSON.parse(localStorage.getItem('auth_user') || 'null') } catch {}
            const isAdmin = Boolean(u?.is_admin)
            if (!isAdmin) return null
            return <button className="primary" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          })()}
          {(() => {
            let user: any = null
            try { user = JSON.parse(localStorage.getItem('auth_user') || 'null') } catch {}
            const isAdmin = Boolean(user?.is_admin)
            if (!isAdmin || !position) return null
            return (
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm('确定删除该职位吗？')) return
                  const res = await fetch(api(`/positions/${position.id}`), { method: 'DELETE', headers: { 'x-admin': 'true' } })
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    alert(d?.detail || '删除失败')
                    return
                  }
                  alert('删除成功')
                  window.location.href = '/positions'
                }}
              >删除职位</button>
            )
          })()}
        </div>

        <h2>职位详情</h2>
        <div className="form">
          <label>
            <span>职位名称</span>
            <input value={position.position_name} onChange={e => setPosition({ ...position, position_name: e.target.value })} readOnly={!JSON.parse(localStorage.getItem('auth_user') || 'null')?.is_admin} />
          </label>

          <label>
            <span>职位描述</span>
            <textarea value={position.position_description ?? ''} onChange={e => setPosition({ ...position, position_description: e.target.value })} rows={4} readOnly={!JSON.parse(localStorage.getItem('auth_user') || 'null')?.is_admin} />
          </label>

          <div className="row">
            <label>
              <span>职位类别</span>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">请选择类别</option>
                {categoryOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span>匹配方式</span>
              <select value={position.match_type} onChange={e => setPosition({ ...position!, match_type: e.target.value as any })}>
                <option value="any">关键词命中任一</option>
                <option value="all">需要全部命中</option>
              </select>
            </label>
          </div>

          <label>
            <span>标签</span>
            <div className="chips">
              {tags.map(t => (
                <span key={t.id} className="chip">
                  {t.tag_name}
                  <button type="button" className="chip-close" onClick={() => removeTag(t.id)}>×</button>
                </span>
              ))}
            </div>
            <div className="tag-grid">
              {categoryOptions.map(cat => (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, margin: '8px 0' }}>{cat}</div>
                  <div className="tag-grid">
                    {allTags.filter(t => t.category === cat).map(t => (
                      <button key={t.id} type="button" className={`tag-pick ${isTagSelected(t) ? 'selected' : ''}`} onClick={() => toggleTag(t)}>
                        {t.tag_name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </label>

          <label>
            <span>关键词</span>
            <div className="chips">
              {keywords.map(k => (
                <span key={k.id} className="chip">
                  {k.keyword}
                  <button type="button" className="chip-close" onClick={() => removeKeyword(k.id)}>×</button>
                </span>
              ))}
            </div>
            <div className="grid">
              {allKeywords.map(k => {
                const selected = keywords.some(s => s.id === k.id)
                return (
                  <button
                    key={k.id}
                    type="button"
                    className={`tag-pick ${selected ? 'selected' : ''}`}
                    onClick={() => (selected ? removeKeyword(k.id) : addKeyword(k))}
                  >
                    {k.keyword}
                  </button>
                )
              })}
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
