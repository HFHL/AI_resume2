import { useEffect, useState } from 'react'
import { api } from '../api'

export type PositionListItem = {
  id: number
  position_name: string
  position_category: string | null
  tags: string[] | null
  match_type: 'any' | 'all'
  created_at?: string
}

export function usePositions() {
  const [items, setItems] = useState<PositionListItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(api('/positions'))
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false))
  }, [])
  return { items, loading }
}