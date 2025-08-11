import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { id: 'upload', label: '上传简历', path: '/upload' },
  { id: 'resumes', label: '简历', path: '/resumes' },
  { id: 'positions', label: '职位', path: '/positions' },
  { id: 'match', label: '匹配', path: '/match' },
] as const

export default function Layout() {
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
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">© {new Date().getFullYear()} AI Resume</footer>
    </div>
  )
}