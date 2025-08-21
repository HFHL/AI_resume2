import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Layout from './components/Layout'
import UploadPage from './pages/UploadPage'
import ResumesPage from './pages/ResumesPage'
import PositionsListPage from './pages/PositionsListPage'
import PositionCreatePage from './pages/PositionCreatePage'
import PositionDetailPage from './pages/PositionDetailPage'
const ResumeDetailPage = lazy(() => import('./pages/ResumeDetailPage'))
import MatchDetailPage from './pages/MatchResumeDetailPage'
import MatchPage from './pages/MatchPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/upload" replace />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="resumes" element={<ResumesPage />} />
        <Route path="resumes/:id" element={<Suspense fallback={<div className="empty">加载中...</div>}><ResumeDetailPage /></Suspense>} />
        <Route path="positions" element={<PositionsListPage />} />
        <Route path="positions/create" element={<PositionCreatePage />} />
        <Route path="positions/:id" element={<PositionDetailPage />} />
        <Route path="match" element={<MatchPage />} />
        <Route path="match/:positionId/resumes/:resumeId" element={<MatchDetailPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  )
}