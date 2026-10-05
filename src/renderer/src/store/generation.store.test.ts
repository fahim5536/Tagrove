import { beforeEach, describe, expect, it } from 'vitest'
import type { ImportedImage, ProjectDetail } from '@shared/ipc'
import { parseKeywordsText, useGenerationStore } from './generation.store'

function image(id: string): ImportedImage {
  return {
    id,
    projectId: 'p1',
    path: id,
    fileName: `${id}.jpg`,
    sizeBytes: 1024,
    lastModifiedMs: 0,
    missing: false,
    fileHash: null,
  }
}

function resetStore(): void {
  useGenerationStore.setState({
    project: null,
    rows: [],
    thumbnails: {},
    keywordsDrafts: {},
    lastEdit: null,
    isRunning: false,
    runProgress: null,
    selectedIds: [],
  })
}

describe('parseKeywordsText', () => {
  it('splits on commas, trims, drops empties, and dedupes case-insensitively', () => {
    expect(parseKeywordsText('a, b , c,,A,B C')).toEqual(['a', 'b', 'c', 'B C'])
  })

  it('collapses internal whitespace', () => {
    expect(parseKeywordsText('lake   view,  river ')).toEqual(['lake view', 'river'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseKeywordsText('   ')).toEqual([])
  })
})

describe('useGenerationStore', () => {
  beforeEach(resetStore)

  it('adds rows and dedupes by id', () => {
    const added = useGenerationStore.getState().addRows([image('/a.jpg'), image('/b.jpg')])
    expect(added).toBe(2)
    expect(useGenerationStore.getState().addRows([image('/a.jpg'), image('/c.jpg')])).toBe(1)
    const rows = useGenerationStore.getState().rows
    expect(rows.map((row) => row.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg'])
    expect(rows[0]).toMatchObject({ status: 'idle', title: '', keywords: [], categoryId: null })
  })

  it('loads a project and clears transient state', () => {
    const detail: ProjectDetail = {
      project: {
        id: 'p1',
        name: 'Beach shoot',
        createdAt: 1,
        updatedAt: 2,
        aiGenerated: true,
        imageCount: 1,
        doneCount: 0,
        failedCount: 0,
        lastExportPath: null,
      },
      images: [
        {
          id: '/a.jpg',
          projectId: 'p1',
          path: '/a.jpg',
          fileName: 'a.jpg',
          sizeBytes: 1,
          lastModifiedMs: 1,
          missing: true,
          sortOrder: 0,
          fileHash: null,
          title: 'Existing title',
          keywords: ['k'],
          categoryId: '11',
          edited: true,
          model: null,
          presetId: null,
          status: 'done',
          error: null,
          generatedAt: 3,
        },
      ],
    }
    useGenerationStore.getState().loadProject(detail)
    const state = useGenerationStore.getState()
    expect(state.project).toEqual({ id: 'p1', name: 'Beach shoot', aiGenerated: true })
    expect(state.rows[0]).toMatchObject({
      title: 'Existing title',
      missing: true,
      edited: true,
      status: 'done',
    })
    expect(state.selectedIds).toEqual([])

    useGenerationStore.getState().loadProject(null)
    expect(useGenerationStore.getState().project).toBe(null)
    expect(useGenerationStore.getState().rows).toEqual([])
  })

  it('applies generation events to the matching row', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg'), image('/b.jpg')])
    store.markPending(['/a.jpg'])

    const apply = useGenerationStore.getState().applyGenerationEvent
    apply({ type: 'run-started', total: 1 })
    expect(useGenerationStore.getState().isRunning).toBe(true)
    expect(useGenerationStore.getState().rows[0]?.status).toBe('pending')

    apply({ type: 'item-started', id: '/a.jpg' })
    expect(useGenerationStore.getState().rows[0]?.status).toBe('running')

    apply({
      type: 'item-completed',
      id: '/a.jpg',
      metadata: { title: 'A calm lake', keywords: ['lake', 'water'], categoryId: '11' },
    })
    const doneRow = useGenerationStore.getState().rows[0]
    expect(doneRow).toMatchObject({ status: 'done', title: 'A calm lake', categoryId: '11' })
    expect(useGenerationStore.getState().runProgress).toMatchObject({
      total: 1,
      completed: 1,
      failed: 0,
    })

    apply({ type: 'item-failed', id: '/b.jpg', message: 'Network error.', code: 'INTERNAL' })
    expect(useGenerationStore.getState().rows[1]).toMatchObject({
      status: 'failed',
      error: 'Network error.',
    })

    apply({ type: 'run-finished', canceled: false, completed: 1, failed: 1 })
    expect(useGenerationStore.getState().isRunning).toBe(false)
    expect(useGenerationStore.getState().runProgress).toBe(null)
  })

  it('flags a row as missing when the failure code is NOT_FOUND', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/gone.jpg')])
    store.applyGenerationEvent({
      type: 'item-failed',
      id: '/gone.jpg',
      message: 'The image file no longer exists.',
      code: 'NOT_FOUND',
    })
    expect(useGenerationStore.getState().rows[0]).toMatchObject({
      status: 'failed',
      missing: true,
    })
  })

  it('does not overwrite a running row when markPending arrives late', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg')])
    store.markPending(['/a.jpg'])
    useGenerationStore.getState().applyGenerationEvent({ type: 'item-started', id: '/a.jpg' })
    store.markPending(['/a.jpg'])
    expect(useGenerationStore.getState().rows[0]?.status).toBe('running')
  })

  it('supports single-level undo for title edits', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg')])
    store.setTitle('/a.jpg', 'Original title')

    store.beginEdit('/a.jpg', 'title')
    expect(useGenerationStore.getState().lastEdit).toMatchObject({
      rowId: '/a.jpg',
      field: 'title',
      value: 'Original title',
    })

    store.setTitle('/a.jpg', 'Edited title')
    store.undo()
    expect(useGenerationStore.getState().rows[0]?.title).toBe('Original title')
    expect(useGenerationStore.getState().lastEdit).toBe(null)
  })

  it('supports undo for keyword edits and restores the draft', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg')])
    store.setKeywordsDraft('/a.jpg', 'lake, water')
    store.commitKeywords('/a.jpg')
    expect(useGenerationStore.getState().rows[0]?.keywords).toEqual(['lake', 'water'])

    store.beginEdit('/a.jpg', 'keywords')
    store.setKeywordsDraft('/a.jpg', 'lake')
    store.commitKeywords('/a.jpg')
    expect(useGenerationStore.getState().rows[0]?.keywords).toEqual(['lake'])

    store.undo()
    expect(useGenerationStore.getState().rows[0]?.keywords).toEqual(['lake', 'water'])
    expect(useGenerationStore.getState().keywordsDrafts['/a.jpg']).toBe('lake, water')
  })

  it('supports undo for category changes', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg')])
    store.setCategory('/a.jpg', '11')

    store.beginEdit('/a.jpg', 'category')
    store.setCategory('/a.jpg', null)
    store.undo()
    expect(useGenerationStore.getState().rows[0]?.categoryId).toBe('11')
  })

  it('tracks row selection', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/a.jpg'), image('/b.jpg')])
    store.toggleRowSelected('/a.jpg')
    store.toggleRowSelected('/b.jpg')
    expect(useGenerationStore.getState().selectedIds).toEqual(['/a.jpg', '/b.jpg'])
    store.toggleRowSelected('/a.jpg')
    expect(useGenerationStore.getState().selectedIds).toEqual(['/b.jpg'])
    store.setSelected(['/a.jpg', '/a.jpg'])
    expect(useGenerationStore.getState().selectedIds).toEqual(['/a.jpg'])
    store.clearSelection()
    expect(useGenerationStore.getState().selectedIds).toEqual([])
  })

  it('updates a row after relinking', () => {
    const store = useGenerationStore.getState()
    store.addRows([image('/old.jpg')])
    store.setRowImage({
      id: '/old.jpg',
      projectId: 'p1',
      path: '/new.png',
      fileName: 'new.png',
      sizeBytes: 5,
      lastModifiedMs: 6,
      missing: false,
      fileHash: 'hash',
    })
    expect(useGenerationStore.getState().rows[0]).toMatchObject({
      path: '/new.png',
      fileName: 'new.png',
      missing: false,
    })
  })

  it('stores thumbnails keyed by path', () => {
    const store = useGenerationStore.getState()
    store.setThumbnail('/a.jpg', {
      dataUrl: 'data:image/jpeg;base64,x',
      width: 10,
      height: 20,
      failed: false,
    })
    expect(useGenerationStore.getState().thumbnails['/a.jpg']).toMatchObject({
      width: 10,
      height: 20,
    })
    store.setThumbnail('/a.jpg', { dataUrl: null, width: 0, height: 0, failed: true })
    expect(useGenerationStore.getState().thumbnails['/a.jpg']?.failed).toBe(true)
  })
})
