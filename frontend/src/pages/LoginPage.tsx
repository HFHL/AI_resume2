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
    alert('仅展示界面，功能未实现')
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


