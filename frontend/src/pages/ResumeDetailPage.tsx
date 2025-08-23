import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useParams, useNavigate, Link } from 'react-router-dom'

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
  tag_names?: string[] | null
  work_experience: string[] | null
  internship_experience: string[] | null
  project_experience: string[] | null
  self_evaluation: string | null
  other: string | null
  created_at?: string
  updated_at?: string
  resume_file_id?: number | null
  file_url?: string | null
  uploaded_by?: string | null
}

export default function ResumeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<ResumeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matchedPositions, setMatchedPositions] = useState<Array<{ id:number; position_name:string; position_category:string|null; tags:string[]; matched_keywords:string[]; hit_count:number; score:number }>>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const url = api(`/resumes/${id}`)
    console.log('[ResumeDetailPage] fetch detail', url)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 10000)
    fetch(url, { signal: controller.signal })
      .then(async r => {
        clearTimeout(t)
        if (!r.ok) {
          const detail = await r.text().catch(() => '')
          throw new Error(detail || '加载失败')
        }
        return r.json()
      })
      .then(d => setItem(d.item))
      .catch(e => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoadingMatches(true)
    fetch(api(`/resumes/${id}/match`))
      .then(r => r.json())
      .then(d => setMatchedPositions(d.items || []))
      .catch(() => setMatchedPositions([]))
      .finally(() => setLoadingMatches(false))
  }, [id])

  const degreeNorm = useMemo(() => {
    const s = (item?.education_degree || '').trim()
    if (!s) return ''
    if (s.includes('博')) return '博士'
    if (s.includes('硕')) return '硕士'
    if (s.includes('本')) return '本科'
    return s
  }, [item])

  return (
    <section className="panel">
      <div className="bar">
        <button className="ghost" onClick={() => navigate(-1)}>← 返回</button>
        <div style={{ flex: 1 }} />
        {(() => {
          let user: any = null
          try { user = JSON.parse(localStorage.getItem('auth_user') || 'null') } catch {}
          const isAdmin = Boolean(user?.is_admin)
          if (!isAdmin || !item) return null
          return (
            <div className="bar" style={{ gap: 8 }}>
              {item.file_url && (
                <a className="ghost" href={item.file_url} download target="_blank" rel="noreferrer">下载简历</a>
              )}
              <button className="danger" onClick={async () => {
                if (!confirm('确定删除这份简历吗？')) return
                const res = await fetch(api(`/resumes/${item.id}`), { method: 'DELETE', headers: { 'x-admin': 'true' } })
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}))
                  alert(d?.detail || '删除失败')
                  return
                }
                alert('删除成功')
                navigate('/resumes')
              }}>删除简历</button>
            </div>
          )
        })()}
      </div>
      <h2>简历详情</h2>

      {loading && <div className="empty">加载中...</div>}
      {error && !loading && <div className="empty">{error}</div>}
      {!loading && !error && item && (
        <div className="resume-detail-layout">
          <div className="resume-detail">
            <div className="detail-grid">
              <div className="detail-card">
                <div className="detail-title">基础信息</div>
                <div className="detail-row"><span>姓名</span><span>{item.name || '未知'}</span></div>
                <div className="detail-row"><span>联系方式</span><span>{item.contact_info || '-'}</span></div>
                <div className="detail-row"><span>最高学历</span><span>{degreeNorm || '-'}</span></div>
                <div className="detail-row"><span>毕业年份</span><span>{item.education_graduation_year ?? '-'}</span></div>
                <div className="detail-row"><span>院校层次</span><span>{(item.education_tiers || []).join('、') || (item.education_tier || '-')}</span></div>
                <div className="detail-row"><span>学校</span><span>{(item.education_school || []).join('、') || '-'}</span></div>
                <div className="detail-row"><span>专业</span><span>{item.education_major || '-'}</span></div>
                <div className="detail-row"><span>录入时间</span><span>{item.created_at ? String(item.created_at).replace('T', ' ').slice(0, 16) : '-'}</span></div>
                <div className="detail-row"><span>上传者</span><span>{item.uploaded_by || '-'}</span></div>
              </div>

              <div className="detail-card">
                <div className="detail-title">标签</div>
                <div className="detail-content">
                  {(item.tag_names || []).length ? (
                    <div className="card-tags">
                      {(item.tag_names || []).map((t, i) => <span key={i} className="pill">{t}</span>)}
                    </div>
                  ) : <span className="muted">无</span>}
                </div>
              </div>

              

              <div className="detail-card">
                <div className="detail-title">工作经历</div>
                <div className="detail-content list-text">
                  {(item.work_experience || []).length ? (
                    <ul>
                      {(item.work_experience || []).map((t, i) => {
                        const raw = String(t || '')
                        const jobKeywords = ['工程师','经理','开发','产品','运营','测试','设计','前端','后端','全栈','算法','数据','销售','市场','人力','HR','专家','负责人','总监','主管','实习','分析师','科学家','架构师','运维','支持','客服','BD','商务','财务','法务','审计']
                        // 1) 提取前缀日期范围（不高亮）
                        const dateRe = /^\s*(\d{4}(?:[./年]\s*\d{1,2})?(?:\s*[—\-–~至到]+\s*(?:至今|现在|\d{4}(?:[./年]\s*\d{1,2})?))?)/
                        const dm = raw.match(dateRe)
                        const datePrefix = dm ? dm[0] : ''
                        const rest0 = raw.slice(datePrefix.length).trim()
                        if (!rest0) return <li key={i}>{raw}</li>
                        // 2) 在剩余文本中定位职位关键词，分割公司/职位
                        let splitPos = -1
                        for (const kw of jobKeywords) {
                          const idx = rest0.indexOf(kw)
                          if (idx > 0 && (splitPos === -1 || idx < splitPos)) splitPos = idx
                        }
                        let company = ''
                        let role = ''
                        let tail = ''
                        if (splitPos > 0) {
                          company = rest0.slice(0, splitPos).trim()
                          const roleAll = rest0.slice(splitPos).trim()
                          // 将职位之后的补充信息划到 tail
                          const m2 = roleAll.match(/^(\S.+?)([，,。;；].+)?$/)
                          role = m2 ? m2[1] : roleAll
                          tail = m2 && m2[2] ? m2[2] : ''
                        } else {
                          // 回退：用最后一个空格切分
                          const parts = rest0.split(/\s+/)
                          if (parts.length >= 2) {
                            company = parts.slice(0, parts.length - 1).join(' ')
                            role = parts[parts.length - 1]
                          } else {
                            return <li key={i}>{raw}</li>
                          }
                        }
                        return (
                          <li key={i}>
                            {datePrefix}
                            {company && <><span className="hl-company">{company}</span>{' '}</>}
                            {role && <span className="hl-role">{role}</span>}
                            {tail}
                          </li>
                        )
                      })}
                    </ul>
                  ) : <span className="muted">无</span>}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-title">实习经历</div>
                <div className="detail-content list-text">
                  {(item.internship_experience || []).length ? (
                    <ul>
                      {(item.internship_experience || []).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : <span className="muted">无</span>}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-title">项目经历</div>
                <div className="detail-content list-text">
                  {(item.project_experience || []).length ? (
                    <ul>
                      {(item.project_experience || []).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : <span className="muted">无</span>}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-title">自我评价</div>
                <div className="detail-content">
                  {item.self_evaluation || <span className="muted">无</span>}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-title">匹配的职位</div>
                <div className="detail-content">
                  {loadingMatches && <div className="muted">匹配中...</div>}
                  {!loadingMatches && matchedPositions.length === 0 && (
                    <div className="muted">无匹配职位</div>
                  )}
                  {!loadingMatches && matchedPositions.length > 0 && (
                    <div className="list">
                      {matchedPositions.slice(0, 10).map(p => (
                        <div key={p.id} className="card">
                          <div className="card-title">{p.position_name}</div>
                          <div className="card-sub">{p.position_category || '未分类'} · 命中 {p.hit_count} 个</div>
                          <div className="card-tags" style={{ marginTop: 6 }}>
                            {p.matched_keywords.map((t, i) => <span key={i} className="pill">{t}</span>)}
                          </div>
                          <div style={{ marginTop: 8, display:'flex', gap:8 }}>
                            <Link className="ghost" to={`/match/${p.id}/resumes/${item.id}`}>查看匹配</Link>
                            <Link className="ghost" to={`/positions/${p.id}`}>查看职位</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="pdf-pane">
            <div className="detail-title">源文件预览</div>
            <div className="bar" style={{ gap: 8, marginBottom: 8 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file || !id) return
                  try {
                    setUploading(true)
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('file_name', file.name)
                    const upRes = await fetch(api('/uploads/supabase'), { method: 'POST', body: fd })
                    if (!upRes.ok) {
                      const detail = await upRes.text().catch(() => '')
                      throw new Error(detail || '上传失败')
                    }
                    const upJson = await upRes.json()
                    const path = upJson.file_path as string
                    if (!path) throw new Error('上传失败：无路径')
                    const bindRes = await fetch(api(`/resumes/${id}/attach_file`), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ path, file_name: file.name, uploaded_by: 'web' })
                    })
                    if (!bindRes.ok) {
                      const detail = await bindRes.text().catch(() => '')
                      throw new Error(detail || '绑定失败')
                    }
                    // 重新加载详情
                    const r = await fetch(api(`/resumes/${id}`))
                    if (r.ok) {
                      const d = await r.json()
                      setItem(d.item)
                    }
                  } catch (err: any) {
                    alert(err?.message || '上传失败')
                  } finally {
                    setUploading(false)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }
                }}
              />
              <button className="ghost" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? '上传中...' : '上传简历文件'}
              </button>
            </div>
            {item.file_url ? (
              <>
                <iframe className="pdf-frame" src={item.file_url} />
                {(() => {
                  let user: any = null
                  try { user = JSON.parse(localStorage.getItem('auth_user') || 'null') } catch {}
                  const isAdmin = Boolean(user?.is_admin)
                  if (!isAdmin) return null
                  return (
                    <div className="bar end" style={{ marginTop: 8 }}>
                      <a className="ghost" href={item.file_url} target="_blank" rel="noreferrer">在新标签打开</a>
                    </div>
                  )
                })()}
              </>
            ) : (
              <div className="empty">未找到源文件链接</div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}


