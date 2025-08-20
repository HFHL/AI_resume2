import { useState } from 'react'
import { supabase } from '../supabase'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { alert('请输入用户名和密码'); return }
    setLoading(true)
    try {
      // 最简：前端直接查表（需 Supabase anon key 能 select）
      const { data, error } = await supabase
        .from('auth_users')
        .select('id, username, role, password_hash, is_active')
        .eq('username', username)
        .limit(1)
      if (error) throw new Error(error.message)
      const row = (data || [])[0] as any
      if (!row || row.is_active === false) throw new Error('用户不存在或已禁用')
      if (String(row.password_hash || '') !== password) throw new Error('用户名或密码错误')
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


