import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectSummary } from '@shared/ipc'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { useNavigationStore } from '@renderer/store/navigation.store'
import { useToast } from '@renderer/hooks/useToast'
import { unwrapIpc } from '@renderer/lib/ipc'
import { cn, formatDate } from '@renderer/lib/utils'

type PendingAction =
  | { kind: 'rename'; project: ProjectSummary; name: string }
  | { kind: 'delete'; project: ProjectSummary }
  | null

export function HistoryPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigationStore((state) => state.navigate)
  const [projects, setProjects] = useState<Array<ProjectSummary>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = unwrapIpc(await window.api.projects.list())
      setProjects(result.projects)
      const settings = await window.api.settings.getState()
      if (settings.ok) setActiveId(settings.data.activeProjectId)
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openProject = useCallback(
    async (id: string) => {
      try {
        unwrapIpc(await window.api.projects.setActive({ id }))
        navigate('generate')
      } catch (error) {
        toast.error(t('history.openFailed'), error instanceof Error ? error.message : String(error))
      }
    },
    [navigate, t, toast],
  )

  const handleCreate = useCallback(async () => {
    setBusy(true)
    try {
      const result = unwrapIpc(await window.api.projects.create({}))
      await openProject(result.project.id)
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [openProject, t, toast])

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        unwrapIpc(await window.api.projects.duplicate({ id }))
        await refresh()
        toast.success(t('common.duplicate'))
      } catch (error) {
        toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
      }
    },
    [refresh, t, toast],
  )

  const handleRename = useCallback(async () => {
    if (pending?.kind !== 'rename') return
    setBusy(true)
    try {
      unwrapIpc(await window.api.projects.rename({ id: pending.project.id, name: pending.name }))
      setPending(null)
      setRenaming(false)
      await refresh()
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [pending, refresh, t, toast])

  const handleDelete = useCallback(async () => {
    if (pending?.kind !== 'delete') return
    setBusy(true)
    try {
      unwrapIpc(await window.api.projects.delete({ id: pending.project.id }))
      setPending(null)
      await refresh()
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [pending, refresh, t, toast])

  const handleReExport = useCallback(
    async (id: string) => {
      try {
        const detail = unwrapIpc(await window.api.projects.get({ id }))
        const result = unwrapIpc(
          await window.api.csv.export({
            projectId: id,
            rows: detail.project.images.map((image) => ({
              fileName: image.fileName,
              title: image.title,
              keywords: image.keywords,
              categoryId: image.categoryId,
            })),
          }),
        )
        if (result.filePath) toast.success(t('generate.toasts.exported'), result.filePath)
        else toast.info(t('generate.toasts.exportCanceled'))
        await refresh()
      } catch (error) {
        toast.error(
          t('history.reExportFailed'),
          error instanceof Error ? error.message : String(error),
        )
      }
    },
    [refresh, t, toast],
  )

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-4xl flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-sm text-fg-muted">{t('history.description')}</p>
        <Button onClick={() => void handleCreate()} loading={busy}>
          {t('history.newProject')}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-subtle">…</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted">
          {t('history.empty')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                'rounded-xl border bg-surface p-4',
                project.id === activeId ? 'border-accent/60' : 'border-border',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-fg">{project.name}</h3>
                    {project.id === activeId ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                        {t('history.activeBadge')}
                      </span>
                    ) : null}
                    {project.aiGenerated ? (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        {t('generate.aiGenerated')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {formatDate(new Date(project.updatedAt).toISOString())} ·{' '}
                    {t('history.imagesCount', { n: project.imageCount })} · {project.doneCount}{' '}
                    {t('common.done').toLowerCase()}
                    {project.failedCount > 0
                      ? ` · ${project.failedCount} ${t('common.failed').toLowerCase()}`
                      : ''}
                  </p>
                  {project.lastExportPath ? (
                    <p
                      className="mt-0.5 truncate text-xs text-fg-subtle"
                      title={project.lastExportPath}
                    >
                      {t('history.lastExport', { path: project.lastExportPath })}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => void openProject(project.id)}>
                    {t('common.open')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPending({ kind: 'rename', project, name: project.name })
                      setRenaming(true)
                    }}
                  >
                    {t('common.rename')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleReExport(project.id)}
                  >
                    {t('history.reExport')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDuplicate(project.id)}
                  >
                    {t('common.duplicate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => setPending({ kind: 'delete', project })}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={renaming && pending?.kind === 'rename'}
        title={t('history.renameTitle')}
        onClose={() => {
          setRenaming(false)
          setPending(null)
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRenaming(false)
                setPending(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              loading={busy}
              disabled={(pending?.kind === 'rename' ? pending.name : '').trim().length === 0}
              onClick={() => void handleRename()}
            >
              {t('common.rename')}
            </Button>
          </>
        }
      >
        <Input
          label={t('history.nameLabel')}
          value={pending?.kind === 'rename' ? pending.name : ''}
          placeholder={t('history.namePlaceholder')}
          onChange={(event) =>
            setPending((current) =>
              current?.kind === 'rename' ? { ...current, name: event.target.value } : current,
            )
          }
          autoFocus
        />
      </Modal>

      <Modal
        open={pending?.kind === 'delete'}
        title={t('history.deleteTitle')}
        description={t('history.deleteBody', {
          name: pending?.kind === 'delete' ? pending.project.name : '',
          n: pending?.kind === 'delete' ? pending.project.imageCount : 0,
        })}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void handleDelete()}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  )
}
