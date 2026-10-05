import { useEffect, useRef } from 'react'
import { useGenerationStore } from '../store/generation.store'
import type { ImageRow } from '../store/generation.store'
import { THUMBNAIL_VISIBLE_OVERSCAN } from '../constants'
import type { VirtualRange } from './useVirtualRows'

const FETCH_CONCURRENCY = 2

/**
 * Loads thumbnails for visible rows (plus overscan) through the main-process
 * service, a few at a time so image decoding cannot flood the IPC channel or
 * the UI. Results are cached in the store, failures are remembered so rows
 * keep a placeholder instead of retrying forever.
 */
export function useThumbnailLoader(rows: Array<ImageRow>, range: VirtualRange): void {
  const thumbnails = useGenerationStore((state) => state.thumbnails)
  const setThumbnail = useGenerationStore((state) => state.setThumbnail)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    if (rows.length === 0) return
    const from = Math.max(0, range.start - THUMBNAIL_VISIBLE_OVERSCAN)
    const to = Math.min(rows.length - 1, range.end + THUMBNAIL_VISIBLE_OVERSCAN)
    if (from > to) return

    let launched = 0
    for (let index = from; index <= to && launched < FETCH_CONCURRENCY; index += 1) {
      const row = rows[index]
      if (!row) continue
      if (thumbnails[row.path] || inFlight.current.has(row.path)) continue
      inFlight.current.add(row.path)
      launched += 1
      const path = row.path
      void window.api.images
        .getThumbnail({ path })
        .then((result) => {
          if (result.ok) {
            setThumbnail(path, {
              dataUrl: result.data.dataUrl,
              width: result.data.width,
              height: result.data.height,
              failed: false,
            })
          } else {
            setThumbnail(path, { dataUrl: null, width: 0, height: 0, failed: true })
          }
        })
        .catch(() => {
          setThumbnail(path, { dataUrl: null, width: 0, height: 0, failed: true })
        })
        .finally(() => {
          inFlight.current.delete(path)
        })
    }
  }, [rows, range.start, range.end, thumbnails, setThumbnail])
}
