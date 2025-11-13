import { useEffect, useState } from 'react'
import { api } from '../api'

type HighlightCompany = { 
  id: number
  company_name: string
  category: string
  created_at?: string
  updated_at?: string
}

const CATEGORIES = ['金融量化', 'web3', '互联网', 'AI', '传统金融']

export default function AdminHighlightCompaniesPage() {
  const [items, setItems] = useState<HighlightCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ company_name: string; category: string }>({ 
    company_name: '', 
    category: '金融量化' 
  })
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const user = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
  const isAdmin = Boolean(user?.is_admin)
  
  if (!isAdmin) {
    return <section className="panel"><div className="empty">仅管理员可访问</div></section>
  }

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterCategory) params.append('category', filterCategory)
      if (searchQuery) params.append('search', searchQuery)
      
      const url = api(`/admin/highlight_companies${params.toString() ? '?' + params.toString() : ''}`)
      const r = await fetch(url, { headers: { 'x-admin': 'true' } })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.detail || '加载失败')
      setItems(d.items || [])
    } catch (e: any) {
      alert(e?.message || '加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterCategory, searchQuery])

  async function createCompany() {
    if (!form.company_name.trim() || !form.category) { 
      alert('请填写公司名称和选择类别')
      return 
    }
    setCreating(true)
    try {
      const r = await fetch(api('/admin/highlight_companies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': 'true' },
        body: JSON.stringify(form),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.detail || '创建失败')
      setForm({ company_name: '', category: '金融量化' })
      load()
    } catch (e: any) {
      alert(e?.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function updateCompany(c: HighlightCompany, patch: Partial<HighlightCompany>) {
    try {
      const r = await fetch(api(`/admin/highlight_companies/${c.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin': 'true' },
        body: JSON.stringify(patch),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.detail || '更新失败')
      load()
    } catch (e: any) {
      alert(e?.message || '更新失败')
    }
  }

  async function deleteCompany(c: HighlightCompany) {
    if (!confirm(`确定要删除公司"${c.company_name}"吗？此操作不可恢复！`)) return
    try {
      const r = await fetch(api(`/admin/highlight_companies/${c.id}`), {
        method: 'DELETE',
        headers: { 'x-admin': 'true' },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.detail || '删除失败')
      alert('删除成功')
      load()
    } catch (e: any) {
      alert(e?.message || '删除失败')
    }
  }

  // 按类别分组
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, HighlightCompany[]>)

  return (
    <section className="panel">
      <h2>高亮公司管理</h2>
      <p className="muted">管理各类别的高亮公司。这些公司会在简历筛选时作为高亮标识。</p>
      
      <div className="form" style={{ marginTop: 12 }}>
        <label>
          <span>公司名称</span>
          <input 
            value={form.company_name} 
            onChange={e => setForm({ ...form, company_name: e.target.value })}
            placeholder="输入公司名称..."
          />
        </label>
        <label>
          <span>类别</span>
          <select 
            value={form.category} 
            onChange={e => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <div className="bar end">
          <button className="primary" onClick={createCompany} disabled={creating}>
            {creating ? '创建中...' : '+ 添加公司'}
          </button>
        </div>
      </div>

      <div style={{ height: 20 }} />

      <div className="bar" style={{ gap: 12 }}>
        <input
          placeholder="搜索公司名称..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <select 
          value={filterCategory} 
          onChange={e => setFilterCategory(e.target.value)}
          style={{ minWidth: '150px' }}
        >
          <option value="">全部类别</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {(filterCategory || searchQuery) && (
          <button className="ghost" onClick={() => { setFilterCategory(''); setSearchQuery('') }}>
            清空筛选
          </button>
        )}
      </div>

      <div style={{ height: 12 }} />
      
      {loading ? (
        <div className="muted">加载中...</div>
      ) : filterCategory ? (
        <div className="list">
          <h3 style={{ marginBottom: 12 }}>{filterCategory}</h3>
          {items.length === 0 ? (
            <div className="muted">暂无数据</div>
          ) : (
            items.map(c => (
              <div key={c.id} className="card">
                <div className="card-title">{c.company_name}</div>
                <div className="card-sub">
                  <span className="pill">{c.category}</span>
                </div>
                <div className="bar" style={{ marginTop: 8 }}>
                  <button className="ghost" onClick={() => {
                    const name = prompt('修改公司名称', c.company_name)
                    if (name && name.trim()) updateCompany(c, { company_name: name.trim() })
                  }}>改名称</button>
                  <button className="ghost" onClick={() => {
                    const cat = prompt(`修改类别 (${CATEGORIES.join(', ')})`, c.category)
                    if (cat && CATEGORIES.includes(cat)) updateCompany(c, { category: cat })
                  }}>改类别</button>
                  <button className="ghost" style={{ color: '#d32f2f' }} onClick={() => deleteCompany(c)}>删除</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div>
          {CATEGORIES.map(category => {
            const companies = groupedItems[category] || []
            return (
              <div key={category} style={{ marginBottom: 32 }}>
                <h3 style={{ marginBottom: 12 }}>
                  {category} 
                  <span className="pill" style={{ marginLeft: 8, fontSize: '14px' }}>
                    {companies.length}
                  </span>
                </h3>
                {companies.length === 0 ? (
                  <div className="muted">暂无公司</div>
                ) : (
                  <div className="list">
                    {companies.map(c => (
                      <div key={c.id} className="card">
                        <div className="card-title">{c.company_name}</div>
                        <div className="bar" style={{ marginTop: 8 }}>
                          <button className="ghost" onClick={() => {
                            const name = prompt('修改公司名称', c.company_name)
                            if (name && name.trim()) updateCompany(c, { company_name: name.trim() })
                          }}>改名称</button>
                          <button className="ghost" onClick={() => {
                            const cat = prompt(`修改类别 (${CATEGORIES.join(', ')})`, c.category)
                            if (cat && CATEGORIES.includes(cat)) updateCompany(c, { category: cat })
                          }}>改类别</button>
                          <button className="ghost" style={{ color: '#d32f2f' }} onClick={() => deleteCompany(c)}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

