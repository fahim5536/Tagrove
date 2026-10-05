import { useEffect, useState } from 'react'
import type { Category } from '@shared/types'

let cache: Array<Category> | null = null

/** Loads the editable category list from main once per session. */
export function useCategories(): Array<Category> {
  const [categories, setCategories] = useState<Array<Category>>(cache ?? [])

  useEffect(() => {
    if (cache) return
    let cancelled = false
    void window.api.config
      .getCategories()
      .then((result) => {
        if (cancelled) return
        cache = result.ok ? result.data.categories : []
        setCategories(cache)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return categories
}
