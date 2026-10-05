import { useUpdaterStore } from '@renderer/store/updater.store'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from '@renderer/components/icons'
import { Button } from '@renderer/components/ui/Button'
import { DetailList } from '@renderer/components/ui/DetailList'
import { ProgressBar } from '@renderer/components/ui/ProgressBar'
import { ROADMAP } from '@renderer/constants'
import { useAppInfo } from '@renderer/hooks/useAppInfo'
import { useToast } from '@renderer/hooks/useToast'
import { unwrapIpc } from '@renderer/lib/ipc'

export function AboutPage() {
  const { t } = useTranslation()
  const { appInfo, error } = useAppInfo()
  const toast = useToast()
  const status = useUpdaterStore((state) => state.status)
  const updaterVersion = useUpdaterStore((state) => state.version)
  const updaterError = useUpdaterStore((state) => state.error)
  const checking = status === 'checking'

  const handleCheckForUpdates = async (): Promise<void> => {
    try {
      const result = unwrapIpc(await window.api.updater.checkForUpdates())
      if (!result.started && result.reason) toast.info(t('updater.check'), result.reason)
    } catch (cause) {
      toast.error(t('common.error'), cause instanceof Error ? cause.message : String(cause))
    }
  }

  const handleCopyDiagnostics = async (): Promise<void> => {
    try {
      unwrapIpc(await window.api.diagnostics.copy())
      toast.success(t('diagnostics.copied'))
    } catch (cause) {
      toast.error(
        t('diagnostics.copyFailed'),
        cause instanceof Error ? cause.message : String(cause),
      )
    }
  }

  const updateStatusText =
    status === 'downloaded'
      ? t('updater.statusDownloaded', { version: updaterVersion ?? '' })
      : status === 'downloading'
        ? t('updater.statusAvailable', { version: updaterVersion ?? '' })
        : status === 'error'
          ? t('updater.statusError', { message: updaterError ?? '' })
          : status === 'not-available'
            ? t('updater.upToDate')
            : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">{appInfo?.appName ?? t('app.name')}</h2>
            <p className="mt-1 font-mono text-sm text-fg-muted">
              {appInfo ? `v${appInfo.appVersion}` : (error ?? '—')}
            </p>
            {updateStatusText ? (
              <p className="mt-1 text-xs text-fg-muted">{updateStatusText}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              variant="secondary"
              loading={checking}
              onClick={() => void handleCheckForUpdates()}
            >
              {t('updater.check')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleCopyDiagnostics()}>
              {t('diagnostics.copy')}
            </Button>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-muted">{t('about.intro')}</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-fg">{t('about.runtime')}</h2>
        <div className="mt-4">
          <DetailList
            items={[
              { label: t('about.electron'), value: appInfo?.electronVersion ?? '—' },
              { label: t('about.chromium'), value: appInfo?.chromeVersion ?? '—' },
              { label: t('about.node'), value: appInfo?.nodeVersion ?? '—' },
              { label: t('about.platform'), value: appInfo?.platform ?? '—' },
              { label: t('about.locale'), value: appInfo?.locale ?? '—' },
              { label: t('about.userData'), value: appInfo?.userDataPath ?? '—' },
              { label: t('about.logFile'), value: appInfo?.logFilePath ?? '—' },
            ]}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-fg">{t('about.roadmap')}</h2>
        <ProgressBar
          className="mt-4"
          value={ROADMAP.PROGRESS_PERCENT}
          label={t('about.phaseComplete', {
            current: ROADMAP.CURRENT_PHASE,
            total: ROADMAP.TOTAL_PHASES,
          })}
        />
        <ul className="mt-5 space-y-2.5">
          {ROADMAP.PHASES.map((phase) => (
            <li key={phase.id} className="flex items-center gap-2.5 text-sm">
              {phase.status === 'done' ? (
                <CheckIcon className="size-4 shrink-0 text-success" />
              ) : (
                <span className="size-2 shrink-0 rounded-full bg-border" />
              )}
              <span className={phase.status === 'done' ? 'text-fg-muted' : 'text-fg-subtle'}>
                Phase {phase.id}: {phase.name}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
