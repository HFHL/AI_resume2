import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

type Position = {
  id: number
  position_name: string
  position_description: string | null
  position_category: '技术类' | '非技术类' | null
  required_keywords: string[] | null
  match_type: 'any' | 'all'
  tags: string[] | null
}

type ResumeDetail = {
  id: number
  name: string | null
  contact_info: string | null
  education_degree: string | null
  education_school: string[] | null
  education_major: string | null
  education_graduation_year: number | null
  education_tier: string | null
  education_tiers: string[] | null
  skills: string[] | null
  work_experience: string[] | null
  internship_experience: string[] | null
  project_experience: string[] | null
  self_evaluation: string | null
  other: string | null
}

export default function MatchDetailPage() {
  const { positionId, resumeId } = useParams()
  const pid = Number(positionId)
  const rid = Number(resumeId)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<Position | null>(null)
  const [resume, setResume] = useState<ResumeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pid || !rid) return
    setLoading(true)
    Promise.all([
      fetch(api(`/positions/${pid}`)).then(r => r.json()),
      fetch(api(`/resumes/${rid}`)).then(r => r.json()),
    ])
      .then(([p, r]) => {
        setPosition(p.item)
        setResume(r.item)
      })
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false))
  }, [pid, rid])

  return (
    <section className="panel">
      <div className="bar">
        <button className="ghost" onClick={() => navigate(-1)}>← 返回</button>
        <div style={{ flex: 1 }} />
        <Link className="ghost" to={`/positions/${pid}`}>查看职位</Link>
        <Link className="ghost" to={`/resumes/${rid}`}>查看简历</Link>
      </div>
      <h2>匹配详情</h2>

      {loading && <div className="empty">加载中...</div>}
      {error && !loading && <div className="empty">{error}</div>}

      {!loading && !error && (
        <div className="match-detail-grid">
          <div className="detail-card">
            <div className="detail-title">职位信息</div>
            {position ? (
              <div className="detail-content">
                <div className="detail-row"><span>名称</span><span>{position.position_name}</span></div>
                <div className="detail-row"><span>类别</span><span>{position.position_category || '-'}</span></div>
                <div className="detail-row"><span>匹配方式</span><span>{position.match_type === 'all' ? '全部命中' : '任一命中'}</span></div>
                <div className="detail-row"><span>关键词</span><span>{(position.required_keywords || []).join('、') || '-'}</span></div>
                <div className="detail-row"><span>标签</span><span>{(position.tags || []).join('、') || '-'}</span></div>
                <div className="detail-row"><span>描述</span><span>{position.position_description || '-'}</span></div>
              </div>
            ) : <div className="muted">无职位信息</div>}
          </div>

          <div className="detail-card">
            <div className="detail-title">简历信息</div>
            {resume ? (
              <div className="detail-content">
                <div className="detail-row"><span>姓名</span><span>{resume.name || '未知'}</span></div>
                <div className="detail-row"><span>联系方式</span><span>{resume.contact_info || '-'}</span></div>
                <div className="detail-row"><span>学历</span><span>{resume.education_degree || '-'}</span></div>
                <div className="detail-row"><span>院校层次</span><span>{(resume.education_tiers || []).join('、') || (resume.education_tier || '-')}</span></div>
                <div className="detail-row"><span>学校</span><span>{(resume.education_school || []).join('、') || '-'}</span></div>
                <div className="detail-row"><span>专业</span><span>{resume.education_major || '-'}</span></div>
                <div className="detail-row"><span>技能</span><span>{(resume.skills || []).join('、') || '-'}</span></div>
                <div className="detail-row"><span>工作经历</span><span>{(resume.work_experience || []).join('；') || '-'}</span></div>
                <div className="detail-row"><span>实习经历</span><span>{(resume.internship_experience || []).join('；') || '-'}</span></div>
                <div className="detail-row"><span>项目经历</span><span>{(resume.project_experience || []).join('；') || '-'}</span></div>
                <div className="detail-row"><span>自我评价</span><span>{resume.self_evaluation || '-'}</span></div>
              </div>
            ) : <div className="muted">无简历信息</div>}
          </div>
        </div>
      )}
    </section>
  )
}


