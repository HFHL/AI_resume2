import { useState } from 'react'
import { api } from '../api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { alert('请输入用户名和密码'); return }
    setLoading(true)
    try {
      const basic = btoa(unescape(encodeURIComponent(`${username}:${password}`)))
      const r = await fetch(api(`/auth/login?auth=${encodeURIComponent(basic)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.detail || r.statusText)
      }
      // 登录成功，跳首页
      window.location.href = '/'
    } catch (e: any) {
      alert(e?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="main">
      <section className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2>登录</h2>
        <form onSubmit={onSubmit} className="form">
          <label>
            <span>用户名</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </label>
          <label>
            <span>密码</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <div className="bar end">
            <button className="primary" type="submit" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}


