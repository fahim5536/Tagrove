import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface VirtualRange {
  start: number
  end: number
}

export interface VirtualRowsResult {
  containerRef: RefObject<HTMLDivElement>
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void
  range: VirtualRange
  totalHeight: number
}

/**
 * Minimal fixed-row-height virtualizer: tracks scroll position and viewport
 * height and reports the visible (plus overscan) index range. Keeps 500+
 * rows cheap without pulling in a windowing library.
 */
export function useVirtualRows(options: {
  itemCount: number
  rowHeight: number
  overscan?: number
}): VirtualRowsResult {
  const { itemCount, rowHeight, overscan = 4 } = options
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const scrollFrame = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight)
    })
    observer.observe(container)
    setViewportHeight(container.clientHeight)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const frame = scrollFrame.current
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      setScrollTop(element.scrollTop)
    })
  }, [])

  const firstVisible = Math.floor(scrollTop / rowHeight)
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(
    itemCount - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  )

  return {
    containerRef,
    handleScroll,
    range: { start: Math.min(start, Math.max(0, itemCount - 1)), end: Math.max(-1, end) },
    totalHeight: itemCount * rowHeight,
  }
}
