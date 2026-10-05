import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/Button'
import { ProgressBar } from '@renderer/components/ui/ProgressBar'
import { useUpdaterStore } from '@renderer/store/updater.store'
import { unwrapIpc } from '@renderer/lib/ipc'
import { useToast } from '@renderer/hooks/useToast'
import { AlertIcon, DownloadIcon, LoaderIcon, XIcon } from '../icons'

/**
 * Non-intrusive floating banner for update progress: downloading → ready →
 * (on failure) error. "Restart and update" quits and installs; "Later"
 * dismisses until the next updater event.
 */
export function UpdateBanner() {
  const { t } = useTranslation()
  const toast = useToast()
  const status = useUpdaterStore((state) => state.status)
  const version = useUpdaterStore((state) => state.version)
  const percent = useUpdaterStore((state) => state.percent)
  const error = useUpdaterStore((state) => state.error)
  const dismissed = useUpdaterStore((state) => state.dismissed)
  const dismiss = useUpdaterStore((state) => state.dismiss)

  if (dismissed || (status !== 'downloading' && status !== 'downloaded' && status !== 'error')) {
    return null
  }

  const restartAndUpdate = async (): Promise<void> => {
    try {
      unwrapIpc(await window.api.updater.install())
    } catch (cause) {
      toast.error(t('common.error'), cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="fixed left-1/2 top-3 z-[70] w-full max-w-md -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xl">
        {status === 'downloading' ? (
          <>
            <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                {t('updater.banner.downloading', { version: version ?? '' })}
              </p>
              <ProgressBar className="mt-2" value={percent} />
            </div>
          </>
        ) : status === 'downloaded' ? (
          <>
            <DownloadIcon className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t('updater.banner.ready')}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {t('updater.banner.readyDetail', { version: version ?? '' })}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => void restartAndUpdate()}>
                  {t('updater.banner.restartToUpdate')}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  {t('updater.banner.later')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t('updater.banner.failed')}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted" title={error ?? undefined}>
                {error}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={dismiss}
              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <XIcon className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
