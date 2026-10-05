import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { generationEventSchema } from '@shared/ipc'
import type { Preset } from '@shared/ipc'
import { validateMetadata } from '@shared/metadata'
import { IMAGES } from '@shared/constants'
import { BulkBar } from '@renderer/components/generate/BulkBar'
import { ResultsTable } from '@renderer/components/generate/ResultsTable'
import { ShortcutsDialog } from '@renderer/components/generate/ShortcutsDialog'
import {
  DownloadIcon,
  HelpIcon,
  ImageIcon,
  PlusIcon,
  SparklesIcon,
} from '@renderer/components/icons'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { ProgressBar } from '@renderer/components/ui/ProgressBar'
import { MAX_FAILURE_TOASTS_PER_RUN } from '@renderer/constants'
import { useCategories } from '@renderer/hooks/useCategories'
import { useToast } from '@renderer/hooks/useToast'
import { unwrapIpc } from '@renderer/lib/ipc'
import { useGenerationStore } from '@renderer/store/generation.store'

type RowFilter = 'all' | 'failed' | 'edited' | 'invalid'

export function GeneratePage() {
  const { t } = useTranslation()
  const rows = useGenerationStore((state) => state.rows)
  const project = useGenerationStore((state) => state.project)
  const isRunning = useGenerationStore((state) => state.isRunning)
  const runProgress = useGenerationStore((state) => state.runProgress)
  const addRows = useGenerationStore((state) => state.addRows)
  const loadProject = useGenerationStore((state) => state.loadProject)
  const markPending = useGenerationStore((state) => state.markPending)
  const applyGenerationEvent = useGenerationStore((state) => state.applyGenerationEvent)
  const lastEdit = useGenerationStore((state) => state.lastEdit)
  const setProjectInfo = useGenerationStore((state) => state.setProjectInfo)
  const setRowImage = useGenerationStore((state) => state.setRowImage)

  const categories = useCategories()
  const toast = useToast()
  const [isDragging, setIsDragging] = useState(false)
  const [exportWarningOpen, setExportWarningOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [presets, setPresets] = useState<Array<Preset>>([])
  const [presetId, setPresetId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RowFilter>('all')
  const dragDepth = useRef(0)
  const failureToastsShown = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const statusCounts = useMemo(() => {
    const counts = { done: 0, failed: 0 }
    for (const row of rows) {
      if (row.status === 'done') counts.done += 1
      if (row.status === 'failed') counts.failed += 1
    }
    return counts
  }, [rows])

  const invalidCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          validateMetadata({ title: row.title, keywords: row.keywords, categoryId: row.categoryId })
            .length > 0,
      ).length,
    [rows],
  )

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'failed' && row.status !== 'failed') return false
      if (filter === 'edited' && !row.edited) return false
      if (
        filter === 'invalid' &&
        validateMetadata({ title: row.title, keywords: row.keywords, categoryId: row.categoryId })
          .length === 0
      ) {
        return false
      }
      if (!needle) return true
      return (
        row.fileName.toLowerCase().includes(needle) ||
        row.title.toLowerCase().includes(needle) ||
        row.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
      )
    })
  }, [rows, search, filter])

  // Load the active project (session recovery) + presets + last selection.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const active = await window.api.projects.getActive()
      if (!cancelled && active.ok && active.data.project) {
        loadProject(active.data.project)
      }
      const presetResult = await window.api.presets.list()
      if (!cancelled && presetResult.ok) setPresets(presetResult.data.presets)
      const settings = await window.api.settings.getState()
      if (!cancelled && settings.ok && settings.data.lastPresetId) {
        setPresetId(settings.data.lastPresetId)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadProject])

  const importPaths = useCallback(
    async (paths: Array<string>) => {
      const unique = [...new Set(paths)].filter((path) => path.length > 0)
      if (unique.length === 0) {
        toast.info(t('generate.toasts.nothingToImport'), t('generate.toasts.nothingToImportDetail'))
        return
      }
      const limited = unique.slice(0, IMAGES.MAX_IMPORT_FILES)
      try {
        const result = unwrapIpc(await window.api.images.add({ paths: limited }))
        const added = addRows(result.accepted)
        if (added > 0) toast.success(t('generate.toasts.imported', { n: added }))
        if (result.duplicates > 0) {
          toast.warning(t('generate.toasts.duplicates', { n: result.duplicates }))
        }
        const skipped = result.rejected.length + (unique.length - limited.length)
        if (skipped > 0) {
          toast.warning(
            t('generate.toasts.skipped', { n: skipped }),
            t('generate.toasts.skippedDetail'),
          )
        }
      } catch (error) {
        toast.error(
          t('generate.toasts.importFailed'),
          error instanceof Error ? error.message : String(error),
        )
      }
    },
    [addRows, t, toast],
  )

  const handlePickFiles = useCallback(async () => {
    try {
      const result = unwrapIpc(await window.api.images.pickFiles())
      await importPaths(result.paths)
    } catch (error) {
      toast.error(
        t('generate.toasts.importFailed'),
        error instanceof Error ? error.message : String(error),
      )
    }
  }, [importPaths, t, toast])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files)
      const paths = files.map((file) => window.api.images.getPathForFile(file))
      void importPaths(paths)
    },
    [importPaths],
  )

  const startGeneration = useCallback(
    async (items: Array<{ id: string; path: string }>) => {
      try {
        unwrapIpc(await window.api.generation.start({ items, presetId: presetId || null }))
        markPending(items.map((item) => item.id))
      } catch (error) {
        toast.error(
          t('generate.toasts.startFailed'),
          error instanceof Error ? error.message : String(error),
        )
      }
    },
    [markPending, presetId, t, toast],
  )

  const handleGenerateAll = useCallback(() => {
    if (rows.length === 0) return
    void startGeneration(rows.map((row) => ({ id: row.id, path: row.path })))
  }, [rows, startGeneration])

  const handleRegenerate = useCallback(
    (rowId: string) => {
      if (isRunning) return
      const row = rows.find((candidate) => candidate.id === rowId)
      if (row) void startGeneration([{ id: row.id, path: row.path }])
    },
    [isRunning, rows, startGeneration],
  )

  const handleRetryFailed = useCallback(() => {
    if (isRunning) return
    const failed = rows.filter((row) => row.status === 'failed')
    if (failed.length > 0) {
      void startGeneration(failed.map((row) => ({ id: row.id, path: row.path })))
    }
  }, [isRunning, rows, startGeneration])

  const handleCancel = useCallback(async () => {
    try {
      await window.api.generation.cancel()
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    }
  }, [t, toast])

  const handleRelink = useCallback(
    async (rowId: string) => {
      try {
        const result = unwrapIpc(await window.api.images.relink({ imageId: rowId }))
        if (result.image) setRowImage(result.image)
      } catch (error) {
        toast.error(
          t('generate.toasts.relinkFailed'),
          error instanceof Error ? error.message : String(error),
        )
      }
    },
    [setRowImage, t, toast],
  )

  const handleAiGeneratedToggle = useCallback(
    async (checked: boolean) => {
      if (!project) return
      try {
        const result = unwrapIpc(
          await window.api.projects.setAiGenerated({ id: project.id, aiGenerated: checked }),
        )
        setProjectInfo({
          id: result.project.id,
          name: result.project.name,
          aiGenerated: result.project.aiGenerated,
        })
      } catch (error) {
        toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
      }
    },
    [project, setProjectInfo, t, toast],
  )

  // Run progress arrives as push events; every payload is validated before use.
  useEffect(() => {
    const unsubscribe = window.api.generation.onEvent((event) => {
      const parsed = generationEventSchema.safeParse(event)
      if (!parsed.success) return
      applyGenerationEvent(parsed.data)
      if (parsed.data.type === 'run-started') {
        failureToastsShown.current = 0
      }
      if (
        parsed.data.type === 'item-failed' &&
        failureToastsShown.current < MAX_FAILURE_TOASTS_PER_RUN
      ) {
        failureToastsShown.current += 1
        toast.error(t('generate.toasts.generationFailed'), parsed.data.message)
      }
      if (parsed.data.type === 'run-finished') {
        if (parsed.data.canceled) {
          toast.info(t('generate.toasts.canceled'))
        } else if (parsed.data.failed > 0) {
          toast.warning(
            t('generate.toasts.finishedWithFailures', { n: parsed.data.failed }),
            t('generate.toasts.finishedWithFailuresDetail', { done: parsed.data.completed }),
          )
        } else {
          toast.success(t('generate.toasts.allGenerated', { n: parsed.data.completed }))
        }
      }
    })
    return unsubscribe
  }, [applyGenerationEvent, t, toast])

  const doExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const result = unwrapIpc(
        await window.api.csv.export({
          projectId: project?.id,
          rows: rows.map((row) => ({
            fileName: row.fileName,
            title: row.title,
            keywords: row.keywords,
            categoryId: row.categoryId,
          })),
        }),
      )
      if (result.filePath) {
        toast.success(t('generate.toasts.exported'), result.filePath)
      } else {
        toast.info(t('generate.toasts.exportCanceled'))
      }
    } catch (error) {
      toast.error(
        t('generate.toasts.exportFailed'),
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setIsExporting(false)
      setExportWarningOpen(false)
    }
  }, [project?.id, rows, t, toast])

  const handleExportClick = useCallback(() => {
    if (rows.length === 0) {
      toast.error(t('generate.toasts.nothingToExport'), t('generate.toasts.nothingToExportDetail'))
      return
    }
    if (invalidCount > 0) {
      setExportWarningOpen(true)
      return
    }
    void doExport()
  }, [doExport, invalidCount, rows.length, t, toast])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && !event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        handleGenerateAll()
        return
      }
      if (ctrl && !event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        handleExportClick()
        return
      }
      if (ctrl && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (ctrl && !event.shiftKey && event.key.toLowerCase() === 'z') {
        const store = useGenerationStore.getState()
        if (store.lastEdit) {
          event.preventDefault()
          store.undo()
        }
        return
      }
      if (!ctrl && !event.altKey && event.key === '?') {
        const target = event.target as HTMLElement | null
        const typing = target !== null && /^(input|textarea|select)$/i.test(target.tagName)
        if (!typing) {
          event.preventDefault()
          setShortcutsOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [handleExportClick, handleGenerateAll])

  const progress = runProgress
    ? Math.round(((runProgress.completed + runProgress.failed) / runProgress.total) * 100)
    : 0

  const issueSummary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const issue of validateMetadata({
        title: row.title,
        keywords: row.keywords,
        categoryId: row.categoryId,
      })) {
        counts.set(issue.message, (counts.get(issue.message) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  const filters: Array<{ id: RowFilter; label: string; count?: number }> = [
    { id: 'all', label: t('generate.filterAll'), count: rows.length },
    { id: 'failed', label: t('generate.filterFailed'), count: statusCounts.failed },
    {
      id: 'edited',
      label: t('generate.filterEdited'),
      count: rows.filter((row) => row.edited).length,
    },
    { id: 'invalid', label: t('generate.filterInvalid'), count: invalidCount },
  ]

  return (
    <div
      className="relative flex h-full min-h-0 flex-col gap-3"
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setIsDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setIsDragging(false)
        handleDrop(event)
      }}
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10">
          <p className="text-sm font-medium text-accent">{t('generate.dropToImport')}</p>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void handlePickFiles()}>
          <PlusIcon className="size-4" />
          {t('generate.import')}
        </Button>
        <Button onClick={handleGenerateAll} disabled={rows.length === 0 || isRunning}>
          <SparklesIcon className="size-4" />
          {t('generate.generateAll')}
        </Button>
        {isRunning ? (
          <Button variant="danger" onClick={() => void handleCancel()}>
            {t('generate.cancel')}
          </Button>
        ) : statusCounts.failed > 0 ? (
          <Button variant="secondary" onClick={handleRetryFailed}>
            {t('generate.retryFailed', { n: statusCounts.failed })}
          </Button>
        ) : null}

        <div className="mx-1 flex items-center gap-2">
          <label htmlFor="preset-select" className="text-xs text-fg-muted">
            {t('generate.presetLabel')}
          </label>
          <select
            id="preset-select"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
            className="h-8 max-w-48 rounded-md border border-border bg-base px-2 text-xs text-fg focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={project?.aiGenerated ?? false}
            onChange={(event) => void handleAiGeneratedToggle(event.target.checked)}
            disabled={!project}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          {t('generate.aiGenerated')}
        </label>

        <div className="ml-auto flex items-center gap-2">
          {isRunning && runProgress ? (
            <div className="flex items-center gap-2">
              <ProgressBar className="w-44" value={progress} />
              <span className="font-mono text-xs text-fg-muted">
                {runProgress.completed + runProgress.failed}/{runProgress.total}
              </span>
            </div>
          ) : null}
          <span className="text-xs text-fg-subtle">
            {t('generate.imagesCount', { n: rows.length })} · {statusCounts.done}{' '}
            {t('common.done').toLowerCase()}
            {statusCounts.failed > 0
              ? ` · ${statusCounts.failed} ${t('common.failed').toLowerCase()}`
              : ''}
          </span>
          <button
            type="button"
            title={t('generate.shortcuts')}
            aria-label={t('generate.shortcuts')}
            onClick={() => setShortcutsOpen(true)}
            className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <HelpIcon className="size-4" />
          </button>
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            loading={isExporting}
            onClick={handleExportClick}
          >
            <DownloadIcon className="size-4" />
            {t('generate.exportCsv')}
          </Button>
        </div>
      </div>

      <BulkBar
        onRegenerateSelected={(ids) => {
          const items = ids
            .map((id) => {
              const row = rows.find((candidate) => candidate.id === id)
              return row ? { id: row.id, path: row.path } : null
            })
            .filter((item): item is { id: string; path: string } => item !== null)
          if (items.length > 0) void startGeneration(items)
        }}
      />

      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={searchRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('generate.searchPlaceholder')}
          className="h-8 w-72 rounded-md border border-border bg-base px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
        <div className="flex items-center gap-1">
          {filters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={
                filter === entry.id
                  ? 'rounded-md bg-accent-soft px-2.5 py-1 text-xs font-medium text-fg'
                  : 'rounded-md px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg'
              }
            >
              {entry.label}
              {entry.count !== undefined ? (
                <span className="ml-1 font-mono text-fg-subtle">{entry.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-surface/50">
          <div className="flex max-w-md flex-col items-center gap-4 p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <ImageIcon className="size-7" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-fg">{t('generate.emptyTitle')}</h2>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                {t('generate.emptyBody', { max: IMAGES.MAX_IMPORT_FILES })}
              </p>
            </div>
            <Button onClick={() => void handlePickFiles()}>
              <PlusIcon className="size-4" />
              {t('generate.import')}
            </Button>
          </div>
        </div>
      ) : (
        <ResultsTable
          rows={filteredRows}
          categories={categories}
          canRegenerate={!isRunning}
          onRegenerate={handleRegenerate}
          onRelink={(rowId) => void handleRelink(rowId)}
        />
      )}

      <div className="h-5 shrink-0 text-xs text-fg-subtle">
        {lastEdit
          ? t('generate.undoHintActive', { field: lastEdit.field })
          : t('generate.undoHint')}
      </div>

      <Modal
        open={exportWarningOpen}
        title={t('generate.modal.issuesTitle')}
        description={t('generate.modal.issuesBody', { n: invalidCount, total: rows.length })}
        onClose={() => setExportWarningOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportWarningOpen(false)}>
              {t('generate.modal.review')}
            </Button>
            <Button loading={isExporting} onClick={() => void doExport()}>
              {t('generate.modal.exportRows', { n: rows.length })}
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 rounded-lg border border-border bg-base p-3 text-xs text-fg-muted">
          {issueSummary.map(([message, count]) => (
            <li key={message} className="flex items-center justify-between gap-3">
              <span>{message}</span>
              <span className="font-mono text-fg-subtle">×{count}</span>
            </li>
          ))}
        </ul>
      </Modal>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
