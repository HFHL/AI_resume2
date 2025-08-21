import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'

const tabs = [
  { id: 'upload', label: '上传简历', path: '/upload' },
  { id: 'resumes', label: '简历', path: '/resumes' },
  { id: 'positions', label: '职位', path: '/positions' },
  { id: 'match', label: '匹配', path: '/match' },
] as const

export default function Layout() {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null }
  })()
  const location = useLocation()

  function logout() {
    try { localStorage.removeItem('auth_user') } catch {}
    window.location.href = '/login'
  }

  if (!user && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
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
        <div className="bar" style={{ gap: 12 }}>
          {user && <span>您好，{user.full_name || user.account}</span>}
          {!user && <NavLink to="/login" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>登录</NavLink>}
          {user && <button onClick={logout}>退出</button>}
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">© {new Date().getFullYear()} AI Resume</footer>
    </div>
  )
}