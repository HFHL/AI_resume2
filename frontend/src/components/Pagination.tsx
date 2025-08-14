export default function Pagination({ page, pageSize, total, onChange }: {
  page: number; pageSize: number; total: number; onChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)))
  const pages = Array.from({ length: totalPages }).map((_, i) => i + 1)
  const windowed = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
  const withEllipsis: Array<number | '...'> = []
  for (let i = 0; i < windowed.length; i++) {
    const cur = windowed[i]
    if (i === 0) { withEllipsis.push(cur) }
    else {
      const prev = windowed[i - 1]
      if ((cur as number) - (prev as number) > 1) withEllipsis.push('...')
      withEllipsis.push(cur)
    }
  }
  return (
    <div className="pagination">
      <button className="ghost" onClick={() => go(1)} disabled={page === 1}>«</button>
      <button className="ghost" onClick={() => go(page - 1)} disabled={page === 1}>上一页</button>
      <div className="pages">
        {withEllipsis.map((p, i) => p === '...'
          ? <span key={`e-${i}`} className="muted">...</span>
          : (
            <button
              key={p}
              className={`page-btn ${page === p ? 'active' : ''}`}
              onClick={() => go(p as number)}
            >{p}</button>
          )
        )}
      </div>
      <button className="ghost" onClick={() => go(page + 1)} disabled={page === totalPages}>下一页</button>
      <button className="ghost" onClick={() => go(totalPages)} disabled={page === totalPages}>»</button>
      <div className="muted small">共 {total} 条</div>
    </div>
  )
}