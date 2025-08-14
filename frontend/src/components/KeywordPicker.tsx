import { useMemo, useState } from 'react'

export type Keyword = { id: number; keyword: string }

export default function KeywordPicker({ options, selected, onPick, onRemove, onCreate }: {
  options: Keyword[]
  selected: Keyword[]
  onPick: (k: Keyword) => void
  onRemove: (id: number) => void
  onCreate: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter(o => o.keyword.toLowerCase().includes(q)) : options
    return list.slice(0, 30)
  }, [options, query])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const text = query.trim()
      if (text) {
        onCreate(text)
        setQuery('')
      }
    }
  }

  return (
    <div>
      <input
        placeholder="输入关键词并回车新增，或从下方选择"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="grid">
        {filtered.map(k => {
          const isSelected = selected.some(s => s.id === k.id)
          return (
            <button
              key={k.id}
              type="button"
              className={`tag-pick ${isSelected ? 'selected' : ''}`}
              onClick={() => (isSelected ? onRemove(k.id) : onPick(k))}
            >
              {k.keyword}
            </button>
          )
        })}
        {filtered.length === 0 && <div className="muted">无匹配关键词，可回车新增</div>}
      </div>
    </div>
  )
}