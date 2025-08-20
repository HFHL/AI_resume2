import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import App from './App'
import { api } from './api'
import './styles.css'

function GuardedApp() {
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (loc.pathname === '/login') { setOk(true); setReady(true); return }
      try {
        const r = await fetch(api('/auth/me'), { credentials: 'include' })
        if (r.ok) {
          if (!cancelled) { setOk(true); setReady(true) }
        } else {
          if (!cancelled) { setOk(false); setReady(true); nav('/login') }
        }
      } catch {
        if (!cancelled) { setOk(false); setReady(true); nav('/login') }
      }
    }
    check()
    return () => { cancelled = true }
  }, [loc.pathname])

  if (!ready) return <div className="main"><div className="panel"><div className="empty">鉴权中...</div></div></div>
  return ok ? <App /> : null
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <BrowserRouter>
      <GuardedApp />
    </BrowserRouter>
  </StrictMode>
)
