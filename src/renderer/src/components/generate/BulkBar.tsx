import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addKeywordToAll,
  countTitleMatches,
  removeKeywordFromAll,
  replaceInTitles,
} from '@renderer/lib/bulk'
import { useGenerationStore } from '@renderer/store/generation.store'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { XIcon } from '../icons'

type BulkDialog = 'addKeyword' | 'removeKeyword' | 'findReplace' | null

interface BulkBarProps {
  onRegenerateSelected: (rowIds: Array<string>) => void
}

/**
 * Toolbar shown when rows are selected: regenerate, bulk keyword add/remove,
 * and find & replace across titles. Mutations go through the store so the
 * autosave layer persists them like any other edit.
 */
export function BulkBar({ onRegenerateSelected }: BulkBarProps) {
  const { t } = useTranslation()
  const rows = useGenerationStore((state) => state.rows)
  const selectedIds = useGenerationStore((state) => state.selectedIds)
  const clearSelection = useGenerationStore((state) => state.clearSelection)
  const [dialog, setDialog] = useState<BulkDialog>(null)
  const [keyword, setKeyword] = useState('')
  const [find, setFind] = useState('')
  const [replaceWith, setReplaceWith] = useState('')

  if (selectedIds.length === 0) return null

  const applyAndClose = (apply: () => void): void => {
    apply()
    setDialog(null)
    setKeyword('')
    setFind('')
    setReplaceWith('')
  }

  const applyKeyword = (mode: 'add' | 'remove'): void => {
    applyAndClose(() => {
      const mutate =
        mode === 'add'
          ? addKeywordToAll(rows, selectedIds, keyword)
          : removeKeywordFromAll(rows, selectedIds, keyword)
      const byId = new Map(mutate.map((row) => [row.id, row]))
      const store = useGenerationStore.getState()
      for (const row of store.rows) {
        const next = byId.get(row.id)
        if (!next) continue
        if (next.keywords.length !== row.keywords.length) {
          store.setKeywordsDraft(row.id, next.keywords.join(', '))
          store.commitKeywords(row.id)
        }
      }
    })
  }

  const applyFindReplace = (): void => {
    applyAndClose(() => {
      const mutate = replaceInTitles(rows, selectedIds, find, replaceWith)
      const byId = new Map(mutate.map((row) => [row.id, row]))
      const store = useGenerationStore.getState()
      for (const row of store.rows) {
        const next = byId.get(row.id)
        if (next && next.title !== row.title) store.setTitle(row.id, next.title)
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/60 px-3 py-2">
      <span className="text-xs font-medium text-fg">
        {t('generate.bulk.selected', { n: selectedIds.length })}
      </span>
      <Button size="sm" variant="secondary" onClick={() => onRegenerateSelected(selectedIds)}>
        {t('generate.bulk.regenerate')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDialog('addKeyword')}>
        {t('generate.bulk.addKeyword')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDialog('removeKeyword')}>
        {t('generate.bulk.removeKeyword')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDialog('findReplace')}>
        {t('generate.bulk.findReplace')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={clearSelection}
        aria-label={t('generate.bulk.clearSelection')}
        className="ml-auto"
      >
        <XIcon className="size-3.5" />
        {t('generate.bulk.clearSelection')}
      </Button>

      <Modal
        open={dialog === 'addKeyword' || dialog === 'removeKeyword'}
        title={t(
          dialog === 'removeKeyword'
            ? 'generate.bulk.removeKeywordTitle'
            : 'generate.bulk.addKeywordTitle',
        )}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={keyword.trim().length === 0}
              onClick={() => applyKeyword(dialog === 'removeKeyword' ? 'remove' : 'add')}
            >
              {t('generate.bulk.apply')}
            </Button>
          </>
        }
      >
        <Input
          label={t('generate.bulk.keyword')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          autoFocus
        />
      </Modal>

      <Modal
        open={dialog === 'findReplace'}
        title={t('generate.bulk.findReplaceTitle')}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={find.length === 0} onClick={applyFindReplace}>
              {t('generate.bulk.apply')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={t('generate.bulk.find')}
            value={find}
            onChange={(event) => setFind(event.target.value)}
            autoFocus
          />
          <Input
            label={t('generate.bulk.replaceWith')}
            value={replaceWith}
            onChange={(event) => setReplaceWith(event.target.value)}
          />
          <p className="text-xs text-fg-muted">
            {t('generate.bulk.matches', { n: countTitleMatches(rows, selectedIds, find) })}
          </p>
        </div>
      </Modal>
    </div>
  )
}
