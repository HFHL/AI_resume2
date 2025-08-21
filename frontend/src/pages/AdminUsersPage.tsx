import { useEffect, useState } from 'react'
import { api } from '../api'

type User = { id: string; full_name: string; account: string; is_admin: boolean; created_at?: string }

export default function AdminUsersPage() {
  const [items, setItems] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ full_name: string; account: string; password: string; is_admin: boolean }>({ full_name: '', account: '', password: '', is_admin: false })

  const user = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
  const isAdmin = Boolean(user?.is_admin)
  if (!isAdmin) {
    return <section className="panel"><div className="empty">仅管理员可访问</div></section>
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(api('/admin/users'), { headers: { 'x-admin': 'true' } })
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

  useEffect(() => { load() }, [])

  async function createUser() {
    if (!form.full_name || !form.account || !form.password) { alert('请填写姓名、账号、密码'); return }
    setCreating(true)
    try {
      const r = await fetch(api('/admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin': 'true' },
        body: JSON.stringify(form),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.detail || '创建失败')
      setForm({ full_name: '', account: '', password: '', is_admin: false })
      load()
    } catch (e: any) {
      alert(e?.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function updateUser(u: User, patch: Partial<User & { password: string }>) {
    try {
      const r = await fetch(api(`/admin/users/${u.id}`), {
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

  return (
    <section className="panel">
      <h2>用户管理</h2>
      <div className="form" style={{ marginTop: 12 }}>
        <label>
          <span>姓名</span>
          <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
        </label>
        <label>
          <span>账号</span>
          <input value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} />
        </label>
        <label>
          <span>密码（明文）</span>
          <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </label>
        <label>
          <span>管理员</span>
          <input type="checkbox" checked={form.is_admin} onChange={e => setForm({ ...form, is_admin: e.target.checked })} />
        </label>
        <div className="bar end">
          <button className="primary" onClick={createUser} disabled={creating}>{creating ? '创建中...' : '创建用户'}</button>
        </div>
      </div>

      <div style={{ height: 12 }} />
      {loading ? <div className="muted">加载中...</div> : (
        <div className="list">
          {items.map(u => (
            <div key={u.id} className="card">
              <div className="card-title">{u.full_name} {u.is_admin ? <span className="pill primary">管理员</span> : null}</div>
              <div className="card-sub">账号：{u.account}</div>
              <div className="bar" style={{ marginTop: 8 }}>
                <button className="ghost" onClick={() => {
                  const name = prompt('修改姓名', u.full_name) || u.full_name
                  updateUser(u, { full_name: name })
                }}>改姓名</button>
                <button className="ghost" onClick={() => {
                  const acc = prompt('修改账号', u.account) || u.account
                  updateUser(u, { account: acc })
                }}>改账号</button>
                <button className="ghost" onClick={() => {
                  const pwd = prompt('设置新密码（明文）', '') || ''
                  if (!pwd) return
                  updateUser(u, { password: pwd } as any)
                }}>改密码</button>
                <button className="ghost" onClick={() => updateUser(u, { is_admin: !u.is_admin })}>{u.is_admin ? '设为普通' : '设为管理员'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}


