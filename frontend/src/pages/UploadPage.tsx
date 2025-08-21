import { useRef, useState } from 'react'
import Chip from '../components/Chip'
import { api } from '../api'
import { getSupabase } from '../supabase'

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list) return
    // 复制出新的 File 对象数组，避免某些浏览器对同一引用的后续 onChange 不触发
    const picked = Array.from(list)
    setFiles(prev => [...prev, ...picked])
    // 延迟清空，确保本次选择稳定
    setTimeout(() => { e.target.value = '' }, 0)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const list = e.dataTransfer.files
    if (!list) return
    setFiles(prev => [...prev, ...Array.from(list)])
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault() }

  function removeAt(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleUpload() {
    if (files.length === 0) { alert('请选择文件'); return }

    setUploading(true)
    setProgress(0)
    const uploadedUrls: string[] = []
    
    try {
      let done = 0
      const sb = getSupabase()
      if (!sb) {
        alert('未配置前端 Supabase（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）')
        return
      }

      for (const f of files) {
        console.log('开始上传文件:', f.name, '大小:', f.size)
        
        // 创建FormData直接上传文件
        const formData = new FormData()
        formData.append('file', f)
        formData.append('file_name', f.name)
        // 读取当前登录用户，作为 uploaded_by 写入数据库
        try {
          const u = JSON.parse(localStorage.getItem('auth_user') || 'null')
          const who = (u?.full_name || u?.account || 'web') as string
          formData.append('uploaded_by', who)
        } catch {
          formData.append('uploaded_by', 'web')
        }
        
        console.log('发送请求到:', api('/uploads/test'))
        
        // 1) 前端直传到 Supabase Storage（anon key）
        const bucket = (import.meta as any).env?.VITE_SUPABASE_STORAGE_BUCKET as string | undefined
        if (!bucket) throw new Error('缺少 VITE_SUPABASE_STORAGE_BUCKET')
        const ts = Date.now()
        const rand = Math.random().toString(36).slice(2, 8)
        const safe = f.name.replace(/[\\/]/g, '_')
        const objectPath = `resumes/original/${ts}_${rand}_${safe}`
        const { error: upErr } = await sb.storage.from(bucket).upload(objectPath, f, { upsert: false, contentType: (f as any).type || 'application/octet-stream' })
        if (upErr) throw new Error(upErr.message)

        // 2) 生成 publicUrl
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(objectPath)
        const publicUrl = pub?.publicUrl
        if (!publicUrl) throw new Error('生成 publicUrl 失败，请确认桶为 public')

        // 3) 回调完成，记录数据库 resume_files（依然走服务端，写入 uploaded_by）
        const u = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
        const who = (u?.full_name || u?.account || 'web') as string
        const completeRes = await fetch(api('/uploads/complete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: f.name, object_key: objectPath, uploaded_by: who, path: objectPath }),
        })
        if (!completeRes.ok) {
          const txt = await completeRes.text().catch(() => '')
          throw new Error(txt || '回调失败')
        }
        const c = await completeRes.json()
        const finalUrl = publicUrl || c?.item?.file_path
        if (finalUrl) uploadedUrls.push(finalUrl)

        done += 1
        setProgress(Math.round((done / files.length) * 100))
      }

      alert(`上传成功！\n\n文件URL:\n${uploadedUrls.join('\n')}`)
      setFiles([])
      setProgress(0)
    } catch (e: any) {
      console.error('上传出错:', e)
      alert(e.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="panel">
      <h2>上传简历</h2>
      <div>
        {/* 隐藏但可触发的文件选择框，避免使用 hidden 属性引发的首次点击无效问题 */}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          multiple
          onChange={onPick}
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
        />


        <div className="upload">
          <div
            className="upload-card"
            role="button"
            tabIndex={0}
            onClick={() => !uploading && inputRef.current?.click()}
            onKeyDown={(e) => {
              if (uploading) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <span className="upload-icon">＋</span>
            <span className="upload-text">点击或拖拽文件到此处</span>
          </div>
        </div>
        <div className="chips">
          {files.map((f, i) => (
            <Chip key={i} text={`${f.name} (${Math.round(f.size/1024)}KB)`} onClose={() => removeAt(i)} />
          ))}
        </div>

        <div className="bar end">
          {uploading && <span className="muted">已上传 {progress}%</span>}
          <button className="primary" onClick={handleUpload} disabled={uploading}> {uploading ? '上传中...' : '上传'} </button>
        </div>
      </div>
    </section>
  )
}