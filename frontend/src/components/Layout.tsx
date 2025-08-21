import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { id: 'upload', label: '上传简历', path: '/upload' },
  { id: 'resumes', label: '简历', path: '/resumes' },
  { id: 'positions', label: '职位', path: '/positions' },
  { id: 'match', label: '匹配', path: '/match' },
  { id: 'login', label: '登录', path: '/login' },
] as const

export default function Layout() {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null }
  })()

  function logout() {
    try { localStorage.removeItem('auth_user') } catch {}
    window.location.href = '/login'
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">AI 简历匹配</div>
        <nav className="nav">
          {tabs.map(t => (
            <NavLink
              key={t.id}
              to={t.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        {user ? (
          <div className="bar" style={{ gap: 12 }}>
            <span>您好，{user.full_name || user.account}</span>
            <button onClick={logout}>退出</button>
          </div>
        ) : (
          <NavLink to="/login" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>登录</NavLink>
        )}
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">© {new Date().getFullYear()} AI Resume</footer>
    </div>
  )
}