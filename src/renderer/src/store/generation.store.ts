import { create } from 'zustand'
import type { GenerationEvent, ImportedImage, ProjectDetail } from '@shared/ipc'
import { flushMetadataSaves, scheduleMetadataSave } from '../lib/autosave'

export type RowStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'
export type EditableField = 'title' | 'keywords' | 'category'

export interface ProjectInfo {
  id: string
  name: string
  aiGenerated: boolean
}

export interface ImageRow {
  id: string
  projectId: string
  path: string
  fileName: string
  sizeBytes: number
  lastModifiedMs: number
  missing: boolean
  title: string
  keywords: Array<string>
  categoryId: string | null
  edited: boolean
  status: RowStatus
  error: string | null
}

export interface ThumbnailInfo {
  dataUrl: string | null
  width: number
  height: number
  failed: boolean
}

interface LastEdit {
  rowId: string
  field: EditableField
  value: string | Array<string> | null
}

interface RunProgress {
  total: number
  completed: number
  failed: number
}

interface GenerationState {
  project: ProjectInfo | null
  rows: Array<ImageRow>
  thumbnails: Record<string, ThumbnailInfo>
  /** In-progress keyword edits, kept as raw text so typing commas feels natural. */
  keywordsDrafts: Record<string, string>
  lastEdit: LastEdit | null
  isRunning: boolean
  runProgress: RunProgress | null
  selectedIds: Array<string>

  loadProject: (detail: ProjectDetail | null) => void
  setProjectInfo: (project: ProjectInfo) => void
  addRows: (items: Array<ImportedImage>) => number
  beginEdit: (rowId: string, field: EditableField) => void
  setTitle: (rowId: string, title: string) => void
  setKeywordsDraft: (rowId: string, text: string) => void
  commitKeywords: (rowId: string) => void
  setCategory: (rowId: string, categoryId: string | null) => void
  undo: () => void
  setThumbnail: (path: string, info: ThumbnailInfo) => void
  markPending: (ids: Array<string>) => void
  applyGenerationEvent: (event: GenerationEvent) => void
  setRowImage: (image: ImportedImage) => void
  toggleRowSelected: (rowId: string) => void
  setSelected: (rowIds: Array<string>) => void
  clearSelection: () => void
}

/** Parses the editable keyword text field: split, trim, compact, dedupe case-insensitively. */
export function parseKeywordsText(text: string): Array<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const part of text.split(',')) {
    const keyword = part.replace(/\s+/g, ' ').trim()
    if (!keyword) continue
    const lower = keyword.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(keyword)
  }
  return out
}

function updateRow(
  rows: Array<ImageRow>,
  rowId: string,
  update: (row: ImageRow) => ImageRow,
): Array<ImageRow> {
  return rows.map((row) => (row.id === rowId ? update(row) : row))
}

/** Persists a user edit after mutation (no-op outside the browser runtime). */
function persistRow(rows: Array<ImageRow>, rowId: string): void {
  const row = rows.find((candidate) => candidate.id === rowId)
  if (row) {
    scheduleMetadataSave(row.id, () => ({
      title: row.title,
      keywords: row.keywords,
      categoryId: row.categoryId,
    }))
  }
}

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  project: null,
  rows: [],
  thumbnails: {},
  keywordsDrafts: {},
  lastEdit: null,
  isRunning: false,
  runProgress: null,
  selectedIds: [],

  loadProject: (detail) => {
    if (!detail) {
      set({
        project: null,
        rows: [],
        thumbnails: {},
        keywordsDrafts: {},
        lastEdit: null,
        selectedIds: [],
      })
      return
    }
    set({
      project: {
        id: detail.project.id,
        name: detail.project.name,
        aiGenerated: detail.project.aiGenerated,
      },
      rows: detail.images.map((image) => ({
        id: image.id,
        projectId: image.projectId,
        path: image.path,
        fileName: image.fileName,
        sizeBytes: image.sizeBytes,
        lastModifiedMs: image.lastModifiedMs,
        missing: image.missing,
        title: image.title,
        keywords: image.keywords,
        categoryId: image.categoryId,
        edited: image.edited,
        status: image.status,
        error: image.error,
      })),
      thumbnails: {},
      keywordsDrafts: {},
      lastEdit: null,
      selectedIds: [],
    })
  },

  setProjectInfo: (project) => {
    set({ project })
  },

  addRows: (items) => {
    const existing = new Set(get().rows.map((row) => row.id))
    const fresh = items.filter((item) => !existing.has(item.id))
    if (fresh.length === 0) return 0
    set((state) => ({
      rows: [
        ...state.rows,
        ...fresh.map((item) => ({
          id: item.id,
          projectId: item.projectId,
          path: item.path,
          fileName: item.fileName,
          sizeBytes: item.sizeBytes,
          lastModifiedMs: item.lastModifiedMs,
          missing: item.missing,
          title: '',
          keywords: [],
          categoryId: null,
          edited: false,
          status: 'idle' as RowStatus,
          error: null,
        })),
      ],
    }))
    return fresh.length
  },

  beginEdit: (rowId, field) => {
    const row = get().rows.find((candidate) => candidate.id === rowId)
    if (!row) return
    const value =
      field === 'title' ? row.title : field === 'keywords' ? row.keywords : row.categoryId
    set({ lastEdit: { rowId, field, value } })
  },

  setTitle: (rowId, title) => {
    set((state) => {
      const rows = updateRow(state.rows, rowId, (row) => ({ ...row, title }))
      persistRow(rows, rowId)
      return { rows }
    })
  },

  setKeywordsDraft: (rowId, text) => {
    set((state) => ({ keywordsDrafts: { ...state.keywordsDrafts, [rowId]: text } }))
  },

  commitKeywords: (rowId) => {
    const draft = get().keywordsDrafts[rowId]
    if (draft === undefined) return
    const keywords = parseKeywordsText(draft)
    set((state) => {
      const rows = updateRow(state.rows, rowId, (row) => ({ ...row, keywords }))
      persistRow(rows, rowId)
      return {
        keywordsDrafts: { ...state.keywordsDrafts, [rowId]: keywords.join(', ') },
        rows,
      }
    })
  },

  setCategory: (rowId, categoryId) => {
    set((state) => {
      const rows = updateRow(state.rows, rowId, (row) => ({ ...row, categoryId }))
      persistRow(rows, rowId)
      return { rows }
    })
  },

  undo: () => {
    const lastEdit = get().lastEdit
    if (!lastEdit) return
    const row = get().rows.find((candidate) => candidate.id === lastEdit.rowId)
    if (row) {
      if (lastEdit.field === 'title') {
        get().setTitle(lastEdit.rowId, typeof lastEdit.value === 'string' ? lastEdit.value : '')
      } else if (lastEdit.field === 'keywords') {
        const keywords = Array.isArray(lastEdit.value) ? lastEdit.value : []
        set((state) => ({
          keywordsDrafts: { ...state.keywordsDrafts, [lastEdit.rowId]: keywords.join(', ') },
          rows: updateRow(state.rows, lastEdit.rowId, (current) => ({ ...current, keywords })),
        }))
        persistRow(get().rows, lastEdit.rowId)
      } else {
        get().setCategory(
          lastEdit.rowId,
          typeof lastEdit.value === 'string' || lastEdit.value === null ? lastEdit.value : null,
        )
      }
    }
    set({ lastEdit: null })
  },

  setThumbnail: (path, info) => {
    set((state) => ({ thumbnails: { ...state.thumbnails, [path]: info } }))
  },

  markPending: (ids) => {
    // Flush pending edits first so they cannot land after the AI result.
    flushMetadataSaves(ids)
    const idsSet = new Set(ids)
    set((state) => ({
      rows: state.rows.map((row) =>
        idsSet.has(row.id) && row.status !== 'running'
          ? { ...row, status: 'pending', error: null }
          : row,
      ),
    }))
  },

  applyGenerationEvent: (event) => {
    if (event.type === 'run-started') {
      set({ isRunning: true, runProgress: { total: event.total, completed: 0, failed: 0 } })
      return
    }
    if (event.type === 'item-started') {
      set((state) => ({
        rows: updateRow(state.rows, event.id, (row) => ({
          ...row,
          status: 'running',
          error: null,
        })),
      }))
      return
    }
    if (event.type === 'item-completed') {
      set((state) => ({
        rows: updateRow(state.rows, event.id, (row) => ({
          ...row,
          status: 'done',
          error: null,
          edited: false,
          title: event.metadata.title,
          keywords: event.metadata.keywords,
          categoryId: event.metadata.categoryId,
        })),
        runProgress: state.runProgress
          ? { ...state.runProgress, completed: state.runProgress.completed + 1 }
          : null,
      }))
      return
    }
    if (event.type === 'item-failed') {
      const fileMissing = event.code === 'NOT_FOUND'
      set((state) => ({
        rows: updateRow(state.rows, event.id, (row) => ({
          ...row,
          status: 'failed',
          error: event.message,
          missing: fileMissing ? true : row.missing,
        })),
        runProgress: state.runProgress
          ? { ...state.runProgress, failed: state.runProgress.failed + 1 }
          : null,
      }))
      return
    }
    // run-finished
    set({ isRunning: false, runProgress: null })
  },

  setRowImage: (image) => {
    set((state) => ({
      rows: updateRow(state.rows, image.id, (row) => ({
        ...row,
        path: image.path,
        fileName: image.fileName,
        sizeBytes: image.sizeBytes,
        lastModifiedMs: image.lastModifiedMs,
        missing: image.missing,
      })),
      thumbnails: {
        ...state.thumbnails,
        [image.path]: { dataUrl: null, width: 0, height: 0, failed: false },
      },
    }))
  },

  toggleRowSelected: (rowId) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(rowId)
        ? state.selectedIds.filter((id) => id !== rowId)
        : [...state.selectedIds, rowId],
    }))
  },

  setSelected: (rowIds) => {
    set({ selectedIds: [...new Set(rowIds)] })
  },

  clearSelection: () => {
    set({ selectedIds: [] })
  },
}))
