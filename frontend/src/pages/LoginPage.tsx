import { useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading] = useState(false)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) {
      alert('请输入用户名和密码')
      return
    }
    ;(async () => {
      try {
        console.log('[LoginPage] submit with', { username, hasPassword: Boolean(password) })
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const data = await res.json().catch(() => ({}))
        console.log('[LoginPage] response', { status: res.status, data })
        if (!res.ok) {
          alert(data?.detail || '登录失败')
          return
        }
        if (data?.success) {
          alert('登录成功')
          // 简单处理：登录成功后返回首页
          window.location.href = '/'
        } else {
          alert(data?.detail || '密码不正确')
        }
      } catch (err: any) {
        alert(err?.message || '网络错误')
      }
    })()
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


