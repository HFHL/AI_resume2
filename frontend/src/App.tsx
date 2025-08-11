import { useState } from 'react'

const tabs = [
  { id: 'upload', label: '上传简历' },
  { id: 'resumes', label: '简历' },
  { id: 'positions', label: '职位' },
  { id: 'match', label: '匹配' },
] as const

type TabId = typeof tabs[number]['id']

export default function App() {
  const [active, setActive] = useState<TabId>('upload')

  return (
    <div className="page">
      <header className="header">
        <div className="brand">AI 简历匹配</div>
        <nav className="nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`nav-item ${active === t.id ? 'active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {active === 'upload' && (
          <section className="panel">
            <h2>上传简历</h2>
            <div className="upload">
              <label className="upload-card">
                <input type="file" accept=".pdf,.doc,.docx,.txt" hidden />
                <span className="upload-icon">＋</span>
                <span className="upload-text">点击或拖拽文件到此处</span>
              </label>
            </div>
          </section>
        )}

        {active === 'resumes' && (
          <section className="panel">
            <h2>简历</h2>
            <p className="muted">这里将展示已上传的简历列表。</p>
          </section>
        )}

        {active === 'positions' && (
          <section className="panel">
            <h2>职位</h2>
            <p className="muted">这里将展示职位配置与关键字。</p>
          </section>
        )}

        {active === 'match' && (
          <section className="panel">
            <h2>匹配</h2>
            <p className="muted">在此执行职位与简历的匹配分析。</p>
          </section>
        )}
      </main>

      <footer className="footer">© {new Date().getFullYear()} AI Resume</footer>
    </div>
  )
}
