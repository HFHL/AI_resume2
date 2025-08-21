import { useRef, useState } from 'react'
import Chip from '../components/Chip'
import { api } from '../api'

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
        
        // 1) 申请签名上传 URL
        const presignRes = await fetch(api('/uploads/presign'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: f.name, content_type: (f as any).type || 'application/octet-stream' }),
        })
        if (!presignRes.ok) {
          const txt = await presignRes.text().catch(() => '')
          throw new Error(txt || '获取上传地址失败')
        }
        const { signed_url, path, public_url } = await presignRes.json()
        if (!signed_url || !path) throw new Error('获取上传地址失败：响应不完整')

        // 2) 直传 Storage（PUT）
        const putRes = await fetch(signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': (f as any).type || 'application/octet-stream' },
          body: f,
        })
        if (!putRes.ok) {
          const txt = await putRes.text().catch(() => '')
          throw new Error(txt || '直传失败')
        }

        // 3) 回调完成，记录数据库 resume_files
        const u = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
        const who = (u?.full_name || u?.account || 'web') as string
        const completeRes = await fetch(api('/uploads/complete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: f.name, object_key: path, uploaded_by: who, path }),
        })
        if (!completeRes.ok) {
          const txt = await completeRes.text().catch(() => '')
          throw new Error(txt || '回调失败')
        }
        const c = await completeRes.json()
        const finalUrl = public_url || c?.item?.file_path
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