import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category } from '@shared/types'
import { validateMetadata } from '@shared/metadata'
import type { MetadataIssue } from '@shared/metadata'
import { cn } from '@renderer/lib/utils'
import { RESULTS_ROW_HEIGHT } from '@renderer/constants'
import { useGenerationStore } from '@renderer/store/generation.store'
import type { ImageRow, RowStatus } from '@renderer/store/generation.store'
import { useThumbnailLoader } from '@renderer/hooks/useThumbnailLoader'
import { useVirtualRows } from '@renderer/hooks/useVirtualRows'
import { AlertIcon, ImageIcon, LoaderIcon, PencilIcon, RegenerateIcon } from '../icons'

const GRID_TEMPLATE =
  '34px 64px minmax(110px,150px) minmax(180px,1fr) minmax(180px,1fr) 136px 60px 104px'
const GRID_STYLE = { display: 'grid', gridTemplateColumns: GRID_TEMPLATE } as const

const STATUS_STYLES: Record<RowStatus, string> = {
  idle: 'bg-surface-2 text-fg-subtle',
  pending: 'bg-accent-soft text-fg-muted',
  running: 'bg-accent-soft text-accent',
  done: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
}

const STATUS_KEYS: Record<RowStatus, string> = {
  idle: 'common.idle',
  pending: 'common.pending',
  running: 'common.running',
  done: 'common.done',
  failed: 'common.failed',
}

function StatusChip({ row }: { row: ImageRow }) {
  const { t } = useTranslation()
  return (
    <span
      title={row.error ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        STATUS_STYLES[row.status],
      )}
    >
      {row.status === 'running' ? <LoaderIcon className="size-3 animate-spin" /> : null}
      {t(STATUS_KEYS[row.status])}
    </span>
  )
}

function IssueBadge({ issues }: { issues: Array<MetadataIssue> }) {
  if (issues.length === 0) return null
  const hasError = issues.some((issue) => issue.severity === 'error')
  return (
    <span
      title={issues.map((issue) => issue.message).join('\n')}
      aria-label={issues.map((issue) => issue.message).join('; ')}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
        hasError ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning',
      )}
    >
      !
    </span>
  )
}

interface ResultRowProps {
  row: ImageRow
  rowIndex: number
  categories: Array<Category>
  canRegenerate: boolean
  onRegenerate: (rowId: string) => void
  onRelink: (rowId: string) => void
}

function ResultRow({
  row,
  rowIndex,
  categories,
  canRegenerate,
  onRegenerate,
  onRelink,
}: ResultRowProps) {
  const { t } = useTranslation()
  const beginEdit = useGenerationStore((state) => state.beginEdit)
  const setTitle = useGenerationStore((state) => state.setTitle)
  const setKeywordsDraft = useGenerationStore((state) => state.setKeywordsDraft)
  const commitKeywords = useGenerationStore((state) => state.commitKeywords)
  const setCategory = useGenerationStore((state) => state.setCategory)
  const toggleRowSelected = useGenerationStore((state) => state.toggleRowSelected)
  const keywordsDraft = useGenerationStore((state) => state.keywordsDrafts[row.id])
  const thumbnail = useGenerationStore((state) => state.thumbnails[row.path])
  const selected = useGenerationStore((state) => state.selectedIds.includes(row.id))

  const issues = useMemo(
    () =>
      validateMetadata({ title: row.title, keywords: row.keywords, categoryId: row.categoryId }),
    [row.title, row.keywords, row.categoryId],
  )
  const titleIssue = issues.find((issue) => issue.field === 'title')
  const keywordIssue = issues.find((issue) => issue.field === 'keywords')

  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      data-row-id={row.id}
      data-selected={selected || undefined}
      style={{
        ...GRID_STYLE,
        position: 'absolute',
        top: rowIndex * RESULTS_ROW_HEIGHT,
        height: RESULTS_ROW_HEIGHT,
        left: 0,
        right: 0,
      }}
      className={cn(
        'items-center gap-2 border-b border-border/60 px-2 transition-colors',
        selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2/40',
        row.status === 'failed' && !selected && 'bg-danger/5',
        row.status === 'running' && !selected && 'bg-accent-soft/40',
      )}
    >
      <div role="gridcell">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleRowSelected(row.id)}
          aria-label={t('generate.selectRow', { name: row.fileName })}
          className="size-3.5 accent-[var(--color-accent)]"
        />
      </div>
      <div
        role="gridcell"
        className="flex size-12 items-center justify-center overflow-hidden rounded-md border border-border bg-base"
      >
        {thumbnail?.dataUrl ? (
          <img
            src={thumbnail.dataUrl}
            alt=""
            draggable={false}
            className={cn('size-12 object-cover', row.missing && 'opacity-30 grayscale')}
          />
        ) : (
          <ImageIcon className={cn('size-5', row.missing ? 'text-danger' : 'text-fg-subtle')} />
        )}
      </div>
      <div role="gridcell" className="min-w-0">
        <span className="block truncate text-xs text-fg-muted" title={row.path}>
          {row.fileName}
        </span>
        {row.missing ? (
          <button
            type="button"
            onClick={() => onRelink(row.id)}
            className="mt-0.5 inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/20"
          >
            <AlertIcon className="size-2.5" />
            {t('common.relink')}
          </button>
        ) : row.edited ? (
          <span
            title={t('common.edited')}
            className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-info"
          >
            <PencilIcon className="size-2.5" />
            {t('common.edited')}
          </span>
        ) : null}
      </div>
      <div role="gridcell" className="min-w-0 pr-1">
        <input
          value={row.title}
          placeholder={t('generate.titlePlaceholder')}
          aria-label={`${t('generate.table.title')} — ${row.fileName}`}
          aria-invalid={titleIssue?.severity === 'error'}
          title={titleIssue?.message}
          onFocus={() => beginEdit(row.id, 'title')}
          onChange={(event) => setTitle(row.id, event.target.value)}
          onKeyDown={commitOnEnter}
          className={cn(
            'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border focus:border-accent focus:bg-base focus:outline-none',
            titleIssue?.severity === 'error' && 'border-danger/60',
          )}
        />
      </div>
      <div role="gridcell" className="min-w-0 pr-1">
        <input
          value={keywordsDraft ?? row.keywords.join(', ')}
          placeholder={t('generate.keywordsPlaceholder')}
          aria-label={`${t('generate.table.keywords')} — ${row.fileName}`}
          aria-invalid={keywordIssue?.severity === 'error'}
          title={keywordIssue?.message}
          onFocus={() => beginEdit(row.id, 'keywords')}
          onChange={(event) => setKeywordsDraft(row.id, event.target.value)}
          onBlur={() => commitKeywords(row.id)}
          onKeyDown={commitOnEnter}
          className={cn(
            'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border focus:border-accent focus:bg-base focus:outline-none',
            keywordIssue &&
              (keywordIssue.severity === 'error' ? 'border-danger/60' : 'border-warning/60'),
          )}
        />
      </div>
      <div role="gridcell" className="pr-1">
        <select
          value={row.categoryId ?? ''}
          aria-label={`${t('generate.table.category')} — ${row.fileName}`}
          onFocus={() => beginEdit(row.id, 'category')}
          onChange={(event) => setCategory(row.id, event.target.value || null)}
          className={cn(
            'h-8 w-full rounded-md border bg-base px-1.5 text-xs text-fg transition-colors focus:outline-none',
            row.categoryId ? 'border-border' : 'border-warning/50 text-fg-muted',
          )}
        >
          <option value="">—</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.id} · {category.name}
            </option>
          ))}
        </select>
      </div>
      <div role="gridcell" className="flex items-center justify-end gap-1.5 pr-1">
        <span
          className={cn(
            'font-mono text-xs',
            keywordIssue
              ? keywordIssue.severity === 'error'
                ? 'text-danger'
                : 'text-warning'
              : 'text-fg-muted',
          )}
          title={keywordIssue?.message}
        >
          {row.keywords.length}
        </span>
        <IssueBadge issues={issues} />
      </div>
      <div role="gridcell" className="flex items-center justify-between gap-1">
        <StatusChip row={row} />
        <button
          type="button"
          title={canRegenerate ? t('generate.regenerate') : t('generate.regenerateBlocked')}
          aria-label={`${t('generate.regenerate')} — ${row.fileName}`}
          disabled={!canRegenerate || row.status === 'running'}
          onClick={() => onRegenerate(row.id)}
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
        >
          {row.status === 'running' ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <RegenerateIcon className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

interface ResultsTableProps {
  rows: Array<ImageRow>
  categories: Array<Category>
  canRegenerate: boolean
  onRegenerate: (rowId: string) => void
  onRelink: (rowId: string) => void
}

export function ResultsTable({
  rows,
  categories,
  canRegenerate,
  onRegenerate,
  onRelink,
}: ResultsTableProps) {
  const { t } = useTranslation()
  const { containerRef, handleScroll, range, totalHeight } = useVirtualRows({
    itemCount: rows.length,
    rowHeight: RESULTS_ROW_HEIGHT,
  })
  useThumbnailLoader(rows, range)
  const selectedIds = useGenerationStore((state) => state.selectedIds)
  const setSelected = useGenerationStore((state) => state.setSelected)

  const visibleRows: Array<{ row: ImageRow; index: number }> = []
  for (let index = range.start; index <= range.end; index += 1) {
    const row = rows[index]
    if (row) visibleRows.push({ row, index })
  }
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every(({ row }) => selectedIds.includes(row.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div
        role="row"
        aria-rowindex={1}
        style={GRID_STYLE}
        className="sticky top-0 z-10 h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2/80 px-2 text-xs font-medium text-fg-muted backdrop-blur"
      >
        <div role="columnheader">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected(
                allVisibleSelected
                  ? selectedIds.filter((id) => !visibleRows.some(({ row }) => row.id === id))
                  : [
                      ...selectedIds,
                      ...visibleRows
                        .map(({ row }) => row.id)
                        .filter((id) => !selectedIds.includes(id)),
                    ],
              )
            }
            aria-label={t('generate.selectAll', { n: visibleRows.length })}
            className="size-3.5 accent-[var(--color-accent)]"
          />
        </div>
        <div role="columnheader">{t('generate.table.preview')}</div>
        <div role="columnheader">{t('generate.table.file')}</div>
        <div role="columnheader">{t('generate.table.title')}</div>
        <div role="columnheader">{t('generate.table.keywords')}</div>
        <div role="columnheader">{t('generate.table.category')}</div>
        <div role="columnheader" className="text-right">
          {t('generate.table.kw')}
        </div>
        <div role="columnheader">{t('generate.table.status')}</div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="grid"
        aria-rowcount={rows.length + 1}
        aria-label={t('generate.table.title')}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleRows.map(({ row, index }) => (
            <ResultRow
              key={row.id}
              row={row}
              rowIndex={index}
              categories={categories}
              canRegenerate={canRegenerate}
              onRegenerate={onRegenerate}
              onRelink={onRelink}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
