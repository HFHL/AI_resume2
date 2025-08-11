import { useRef, useState } from 'react'
import Chip from '../components/Chip'
import { api } from '../api'

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [uploader, setUploader] = useState('')
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
    if (!uploader.trim()) { alert('请输入上传者姓名'); return }
    if (files.length === 0) { alert('请选择文件'); return }
    const form = new FormData()
    form.append('uploaded_by', uploader.trim())
    files.forEach(f => form.append('files', f, f.name))

    setUploading(true)
    setProgress(0)
    try {
      // 使用原生 XMLHttpRequest 以便拿到上传进度
      const xhr = new XMLHttpRequest()
      xhr.open('POST', api('/upload'))
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const p = Math.round((evt.loaded / evt.total) * 100)
          setProgress(p)
        }
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(xhr.responseText || '上传失败'))
          }
        }
        // 防止缓存导致的请求短路
        xhr.setRequestHeader('Cache-Control', 'no-cache')
        xhr.onerror = () => reject(new Error('网络错误'))
        xhr.send(form)
      })

      alert('上传成功，后台将自动解析')
      setFiles([])
      setUploader('')
      setProgress(0)
    } catch (e: any) {
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

        <div className="form">
          <label>
            <span>上传者姓名</span>
            <input value={uploader} onChange={e => setUploader(e.target.value)} placeholder="如：张三" />
          </label>
        </div>

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