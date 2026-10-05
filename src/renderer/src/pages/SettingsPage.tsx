import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Preset, SettingsState } from '@shared/types'
import { APPEARANCE, DB, EXPORT, GENERATION, GEMINI, LANGUAGES } from '@shared/constants'
import { SETTINGS_CHANGED_EVENT } from '@renderer/constants'
import { Button } from '@renderer/components/ui/Button'
import { DetailList } from '@renderer/components/ui/DetailList'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { useAppInfo } from '@renderer/hooks/useAppInfo'
import { useToast } from '@renderer/hooks/useToast'
import { unwrapIpc } from '@renderer/lib/ipc'
import { cn, formatDate } from '@renderer/lib/utils'

type BusyAction = 'key' | 'test' | 'generation' | 'export' | 'preset' | null

function broadcastSettings(state: SettingsState): void {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: state }))
}

function StatusBadge({ hasApiKey }: { hasApiKey: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        hasApiKey
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-warning/40 bg-warning/10 text-warning',
      )}
    >
      {hasApiKey ? t('settings.api.configured') : t('settings.api.notConfigured')}
    </span>
  )
}

interface PresetDraft {
  id?: string
  name: string
  extraInstructions: string
  keywordMin: number | null
  keywordMax: number | null
  tone: string
  alwaysInclude: string
  neverUse: string
}

function toDraft(preset: Preset): PresetDraft {
  return {
    id: preset.id,
    name: preset.name,
    extraInstructions: preset.extraInstructions,
    keywordMin: preset.keywordMin,
    keywordMax: preset.keywordMax,
    tone: preset.tone,
    alwaysInclude: preset.alwaysInclude.join(', '),
    neverUse: preset.neverUse.join(', '),
  }
}

function splitList(text: string): Array<string> {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-fg-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { appInfo } = useAppInfo()
  const [state, setState] = useState<SettingsState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [apiKey, setApiKeyInput] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  // Generation drafts
  const [model, setModel] = useState<string | null>(null)
  const [concurrency, setConcurrency] = useState<number | null>(null)
  const [imageEdge, setImageEdge] = useState<number | null>(null)
  const [retries, setRetries] = useState<number | null>(null)

  // Export drafts
  const [exportDir, setExportDir] = useState<string | null>(null)
  const [dirDirty, setDirDirty] = useState(false)
  const [encoding, setEncoding] = useState<string | null>(null)
  const [pattern, setPattern] = useState<string | null>(null)

  // Presets
  const [presets, setPresets] = useState<Array<Preset>>([])
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null)
  const [crashReports, setCrashReports] = useState<boolean | null>(null)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [updateChannelDraft, setUpdateChannelDraft] = useState<'stable' | 'beta' | null>(null)
  const [presetDelete, setPresetDelete] = useState<Preset | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.api.settings.getState()
    if (result.ok) {
      setState(result.data)
      setLoadError(null)
    } else {
      setLoadError(result.error.message)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void window.api.presets.list().then((result) => {
      if (result.ok) setPresets(result.data.presets)
    })
  }, [refresh])

  const current = {
    model: model ?? state?.model ?? GEMINI.DEFAULT_MODEL,
    concurrency: concurrency ?? state?.maxConcurrentRequests ?? GENERATION.DEFAULT_CONCURRENCY,
    imageEdge: imageEdge ?? state?.modelImageEdge ?? GEMINI.DEFAULT_IMAGE_EDGE,
    retries: retries ?? state?.maxRetries ?? GENERATION.DEFAULT_MAX_RETRIES,
    exportDir: exportDir ?? state?.exportDefaultDir ?? null,
    encoding: encoding ?? state?.csvEncoding ?? EXPORT.DEFAULT_CSV_ENCODING,
    pattern: pattern ?? state?.filenamePattern ?? EXPORT.DEFAULT_FILENAME_PATTERN,
  }

  const handleSaveKey = async (): Promise<void> => {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    setBusy('key')
    try {
      const next = unwrapIpc(await window.api.settings.setApiKey({ apiKey: trimmed }))
      setState(next)
      broadcastSettings(next)
      setApiKeyInput('')
      toast.success(t('settings.keySaved'), t('settings.keySavedDetail'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleClearKey = async (): Promise<void> => {
    setBusy('key')
    try {
      const next = unwrapIpc(await window.api.settings.clearApiKey())
      setState(next)
      broadcastSettings(next)
      setConfirmClearOpen(false)
      toast.success(t('settings.keyRemoved'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleTestConnection = async (): Promise<void> => {
    setBusy('test')
    setTestResult(null)
    try {
      const result = unwrapIpc(await window.api.ai.testConnection())
      setTestResult({
        ok: result.ok,
        text: result.ok
          ? t('settings.api.testOk', { ms: result.latencyMs })
          : (result.error ?? t('settings.api.testFailed')),
      })
    } catch (error) {
      setTestResult({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  const handleSaveGeneration = async (): Promise<void> => {
    setBusy('generation')
    try {
      unwrapIpc(
        await window.api.settings.setGenerationOptions({
          maxConcurrentRequests: current.concurrency,
          modelImageEdge: current.imageEdge,
          maxRetries: current.retries,
        }),
      )
      const withModel = unwrapIpc(
        await window.api.settings.setModel({ model: current.model.trim() }),
      )
      setState(withModel)
      broadcastSettings(withModel)
      setModel(null)
      setConcurrency(null)
      setImageEdge(null)
      setRetries(null)
      toast.success(t('settings.preferencesSaved'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleSaveExport = async (): Promise<void> => {
    setBusy('export')
    try {
      const next = unwrapIpc(
        await window.api.settings.setExportOptions({
          exportDefaultDir: current.exportDir,
          csvEncoding: current.encoding as SettingsState['csvEncoding'],
          filenamePattern: current.pattern,
        }),
      )
      setState(next)
      broadcastSettings(next)
      setDirDirty(false)
      toast.success(t('settings.exportSection.saved'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleChooseFolder = async (): Promise<void> => {
    const result = unwrapIpc(await window.api.data.chooseFolder())
    if (result.dir) {
      setExportDir(result.dir)
      setDirDirty(true)
    }
  }

  const handleAppearance = async (appearance: SettingsState['appearance']): Promise<void> => {
    try {
      const next = unwrapIpc(await window.api.settings.setAppearance({ appearance }))
      setState(next)
      broadcastSettings(next)
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    }
  }

  const handleLanguage = async (language: SettingsState['language']): Promise<void> => {
    try {
      const next = unwrapIpc(await window.api.settings.setLanguage({ language }))
      setState(next)
      broadcastSettings(next)
      await i18n.changeLanguage(language)
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    }
  }

  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateStatus(t('updater.checking'))
    try {
      const result = unwrapIpc(await window.api.updater.checkForUpdates())
      setUpdateStatus(result.started ? null : (result.reason ?? null))
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const handleCrashReports = async (enabled: boolean): Promise<void> => {
    try {
      const next = unwrapIpc(await window.api.settings.setCrashReports({ enabled }))
      setState(next)
      broadcastSettings(next)
      setCrashReports(null)
      toast.success(t('settings.privacy.saved'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    }
  }

  const handleUpdateChannel = async (channel: 'stable' | 'beta'): Promise<void> => {
    try {
      const next = unwrapIpc(await window.api.updater.setChannel({ channel }))
      setState(next)
      broadcastSettings(next)
      setUpdateChannelDraft(null)
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    }
  }

  const handleClearCache = async (): Promise<void> => {
    try {
      const result = unwrapIpc(await window.api.data.clearCache())
      toast.success(t('settings.data.cacheCleared', { n: result.cleared }))
    } catch (error) {
      toast.error(t('common.error'), error instanceof Error ? error.message : String(error))
    }
  }

  const handleExportConfig = async (): Promise<void> => {
    try {
      const result = unwrapIpc(await window.api.data.exportConfig())
      if (result.filePath) toast.success(t('settings.data.configExported'), result.filePath)
    } catch (error) {
      toast.error(
        t('settings.data.exportFailed'),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const handleImportConfig = async (): Promise<void> => {
    try {
      const result = unwrapIpc(await window.api.data.importConfig())
      if (result.imported) {
        toast.success(t('settings.data.configImported'), result.message)
        await refresh()
        const settings = await window.api.settings.getState()
        if (settings.ok) {
          broadcastSettings(settings.data)
          await i18n.changeLanguage(settings.data.language)
        }
        const presetResult = await window.api.presets.list()
        if (presetResult.ok) setPresets(presetResult.data.presets)
      }
    } catch (error) {
      toast.error(
        t('settings.data.importFailed'),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const handleSavePreset = async (): Promise<void> => {
    if (!presetDraft) return
    setBusy('preset')
    try {
      unwrapIpc(
        await window.api.presets.save({
          id: presetDraft.id,
          name: presetDraft.name,
          extraInstructions: presetDraft.extraInstructions,
          keywordMin: presetDraft.keywordMin,
          keywordMax: presetDraft.keywordMax,
          tone: presetDraft.tone,
          alwaysInclude: splitList(presetDraft.alwaysInclude),
          neverUse: splitList(presetDraft.neverUse),
        }),
      )
      setPresetDraft(null)
      const listResult = await window.api.presets.list()
      if (listResult.ok) setPresets(listResult.data.presets)
      toast.success(t('settings.presets.saved'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleDeletePreset = async (): Promise<void> => {
    if (!presetDelete) return
    setBusy('preset')
    try {
      unwrapIpc(await window.api.presets.delete({ id: presetDelete.id }))
      setPresetDelete(null)
      const listResult = await window.api.presets.list()
      if (listResult.ok) setPresets(listResult.data.presets)
      toast.success(t('settings.presets.deleted'))
    } catch (error) {
      toast.error(t('settings.saveFailed'), error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const generationDirty =
    model !== null || concurrency !== null || imageEdge !== null || retries !== null
  const exportDirty = encoding !== null || pattern !== null || dirDirty

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <Section title={t('settings.api.title')} subtitle={t('settings.api.subtitle')}>
        <div className="flex items-center justify-end">
          {state ? <StatusBadge hasApiKey={state.hasApiKey} /> : null}
        </div>

        {loadError ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {loadError}
          </p>
        ) : (
          <div className="max-w-md">
            <Input
              label={t('settings.api.keyLabel')}
              type="password"
              placeholder={t('settings.api.keyPlaceholder')}
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKeyInput(event.target.value)}
              hint={t('settings.api.keyHint')}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                loading={busy === 'key'}
                disabled={!apiKey.trim() || busy !== null}
                onClick={() => void handleSaveKey()}
              >
                {t('settings.api.saveKey')}
              </Button>
              <Button
                variant="ghost"
                loading={busy === 'key'}
                disabled={!state?.hasApiKey || busy !== null}
                onClick={() => setConfirmClearOpen(true)}
              >
                {t('settings.api.remove')}
              </Button>
              <Button
                variant="secondary"
                loading={busy === 'test'}
                disabled={busy !== null}
                onClick={() => void handleTestConnection()}
              >
                {busy === 'test' ? t('settings.api.testing') : t('settings.api.testConnection')}
              </Button>
              {state?.updatedAt ? (
                <span className="ml-auto text-xs text-fg-subtle">
                  {t('settings.api.updated', { date: formatDate(state.updatedAt) })}
                </span>
              ) : null}
            </div>
            {testResult ? (
              <p
                className={cn(
                  'mt-3 rounded-lg border p-3 text-xs',
                  testResult.ok
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-danger/40 bg-danger/10 text-danger',
                )}
              >
                {testResult.text}
              </p>
            ) : null}
          </div>
        )}
      </Section>

      <Section title={t('settings.generation.title')} subtitle={t('settings.generation.subtitle')}>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model-input" className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.generation.model')}
            </label>
            <input
              id="model-input"
              list="model-options"
              value={current.model}
              onChange={(event) => setModel(event.target.value)}
              spellCheck={false}
              className="h-9 w-full rounded-md border border-border bg-base px-3 text-sm text-fg focus:border-accent focus:outline-none"
            />
            <datalist id="model-options">
              {GEMINI.KNOWN_MODELS.map((known) => (
                <option key={known} value={known} />
              ))}
            </datalist>
          </div>
          <div>
            <label
              htmlFor="concurrency-select"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              {t('settings.generation.parallel')}
            </label>
            <select
              id="concurrency-select"
              value={current.concurrency}
              onChange={(event) => setConcurrency(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-border bg-base px-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              {Array.from({ length: GENERATION.MAX_CONCURRENCY }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
            <p className="mt-1.5 text-xs text-fg-subtle">{t('settings.generation.parallelHint')}</p>
          </div>
          <div>
            <label htmlFor="edge-select" className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.generation.imageEdge')}
            </label>
            <select
              id="edge-select"
              value={current.imageEdge}
              onChange={(event) => setImageEdge(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-border bg-base px-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              {GEMINI.IMAGE_EDGE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} px
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="retries-select" className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.generation.retries')}
            </label>
            <select
              id="retries-select"
              value={current.retries}
              onChange={(event) => setRetries(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-border bg-base px-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              {Array.from({ length: GENERATION.MAX_RETRIES_LIMIT + 1 }, (_, index) => index).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
            <p className="mt-1.5 text-xs text-fg-subtle">{t('settings.generation.retriesHint')}</p>
          </div>
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            loading={busy === 'generation'}
            disabled={!generationDirty || busy !== null || current.model.trim().length < 3}
            onClick={() => void handleSaveGeneration()}
          >
            {t('settings.generation.savePreferences')}
          </Button>
        </div>
      </Section>

      <Section title={t('settings.presets.title')} subtitle={t('settings.presets.subtitle')}>
        <div className="space-y-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-base px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-fg">{preset.name}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {preset.keywordMin ?? '—'}–{preset.keywordMax ?? '—'} · {preset.tone || '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPresetDraft(toDraft(preset))}
                >
                  {t('settings.presets.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setPresetDelete(preset)}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setPresetDraft({
                name: '',
                extraInstructions: '',
                keywordMin: 30,
                keywordMax: 49,
                tone: '',
                alwaysInclude: '',
                neverUse: '',
              })
            }
          >
            {t('settings.presets.new')}
          </Button>
        </div>
      </Section>

      <Section
        title={t('settings.exportSection.title')}
        subtitle={t('settings.exportSection.subtitle')}
      >
        <div className="max-w-2xl space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.exportSection.defaultFolder')}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="h-9 min-w-0 flex-1 truncate rounded-md border border-border bg-base px-3 text-sm leading-9 text-fg-muted"
                title={current.exportDir ?? undefined}
              >
                {current.exportDir ?? '—'}
              </span>
              <Button variant="secondary" onClick={() => void handleChooseFolder()}>
                {t('settings.exportSection.choose')}
              </Button>
              <Button
                variant="ghost"
                disabled={!dirDirty}
                onClick={() => {
                  setExportDir(null)
                  setDirDirty(false)
                }}
              >
                {t('settings.exportSection.clear')}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="encoding-select" className="mb-1.5 block text-sm font-medium text-fg">
                {t('settings.exportSection.encoding')}
              </label>
              <select
                id="encoding-select"
                value={current.encoding}
                onChange={(event) => setEncoding(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-base px-2 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="utf8-bom">{t('settings.exportSection.encodingBom')}</option>
                <option value="utf8">{t('settings.exportSection.encodingPlain')}</option>
              </select>
            </div>
            <Input
              label={t('settings.exportSection.pattern')}
              value={current.pattern}
              onChange={(event) => setPattern(event.target.value)}
              hint={t('settings.exportSection.patternHint')}
            />
          </div>
          <Button
            variant="secondary"
            loading={busy === 'export'}
            disabled={!exportDirty || busy !== null}
            onClick={() => void handleSaveExport()}
          >
            {t('common.save')}
          </Button>
        </div>
      </Section>

      <Section title={t('settings.appearance.title')}>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.appearance.theme')}
            </span>
            <div className="flex gap-1.5">
              {APPEARANCE.MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void handleAppearance(mode)}
                  className={
                    state?.appearance === mode
                      ? 'rounded-md bg-accent-soft px-3 py-1.5 text-xs font-medium text-fg'
                      : 'rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg'
                  }
                >
                  {t(`settings.appearance.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">
              {t('settings.language.title')}
            </span>
            <div className="flex gap-1.5">
              {LANGUAGES.CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => void handleLanguage(code)}
                  className={
                    state?.language === code
                      ? 'rounded-md bg-accent-soft px-3 py-1.5 text-xs font-medium text-fg'
                      : 'rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg'
                  }
                >
                  {t(`settings.language.${code}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title={t('settings.updates.title')} subtitle={t('settings.updates.subtitle')}>
        <div className="max-w-2xl space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">{t('updater.channel')}</span>
            <div className="flex gap-1.5">
              {(['stable', 'beta'] as const).map((channelOption) => (
                <button
                  key={channelOption}
                  type="button"
                  onClick={() => void handleUpdateChannel(channelOption)}
                  className={
                    (updateChannelDraft ?? state?.updateChannel ?? 'stable') === channelOption
                      ? 'rounded-md bg-accent-soft px-3 py-1.5 text-xs font-medium text-fg'
                      : 'rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg'
                  }
                >
                  {channelOption === 'stable'
                    ? t('updater.channelStable')
                    : t('updater.channelBeta')}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-fg-subtle">{t('updater.channelHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void handleCheckForUpdates()}>
              {updateStatus ?? t('updater.check')}
            </Button>
            <span className="text-xs text-fg-subtle">{t('settings.updates.installNote')}</span>
          </div>
        </div>
      </Section>

      <Section title={t('settings.data.title')} subtitle={t('settings.data.subtitle')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void window.api.data.openFolder().catch(() => {})}
          >
            {t('settings.data.openFolder')}
          </Button>
          <Button variant="secondary" onClick={() => void handleClearCache()}>
            {t('settings.data.clearCache')}
          </Button>
          <Button variant="ghost" onClick={() => void handleExportConfig()}>
            {t('settings.data.exportConfig')}
          </Button>
          <Button variant="ghost" onClick={() => void handleImportConfig()}>
            {t('settings.data.importConfig')}
          </Button>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={crashReports ?? state?.crashReports ?? false}
            onChange={(event) => void handleCrashReports(event.target.checked)}
            className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
          />
          <span>
            {t('settings.data.crashReports')}
            <span className="mt-0.5 block text-xs text-fg-subtle">
              {t('settings.data.crashReportsHint')}
            </span>
          </span>
        </label>
        <div className="mt-4">
          <DetailList
            items={[
              { label: t('settings.data.userDataRow'), value: appInfo?.userDataPath ?? '—' },
              {
                label: t('settings.data.databaseRow'),
                value: appInfo ? `${appInfo.userDataPath}\\${DB.FILE_NAME}` : '—',
              },
              { label: t('settings.data.logRow'), value: appInfo?.logFilePath ?? '—' },
              {
                label: t('settings.data.versionRow'),
                value: appInfo ? `v${appInfo.appVersion}` : '—',
              },
            ]}
          />
        </div>
      </Section>

      <Modal
        open={confirmClearOpen}
        title={t('settings.api.removeTitle')}
        description={t('settings.api.removeBody')}
        onClose={() => setConfirmClearOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClearOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy === 'key'} onClick={() => void handleClearKey()}>
              {t('settings.api.removeKey')}
            </Button>
          </>
        }
      />

      <Modal
        open={presetDraft !== null}
        title={
          presetDraft?.id
            ? t('settings.presets.editorTitleEdit')
            : t('settings.presets.editorTitleNew')
        }
        onClose={() => setPresetDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPresetDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={busy === 'preset'}
              disabled={!presetDraft || presetDraft.name.trim().length === 0}
              onClick={() => void handleSavePreset()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {presetDraft ? (
          <div className="space-y-3">
            <Input
              label={t('settings.presets.name')}
              value={presetDraft.name}
              onChange={(event) => setPresetDraft({ ...presetDraft, name: event.target.value })}
              autoFocus
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-fg">
                {t('settings.presets.extraInstructions')}
              </label>
              <textarea
                value={presetDraft.extraInstructions}
                onChange={(event) =>
                  setPresetDraft({ ...presetDraft, extraInstructions: event.target.value })
                }
                rows={3}
                className="w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('settings.presets.keywordMin')}
                type="number"
                min={1}
                max={99}
                value={presetDraft.keywordMin ?? ''}
                onChange={(event) =>
                  setPresetDraft({
                    ...presetDraft,
                    keywordMin: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
              <Input
                label={t('settings.presets.keywordMax')}
                type="number"
                min={1}
                max={99}
                value={presetDraft.keywordMax ?? ''}
                onChange={(event) =>
                  setPresetDraft({
                    ...presetDraft,
                    keywordMax: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
            </div>
            <Input
              label={t('settings.presets.tone')}
              value={presetDraft.tone}
              onChange={(event) => setPresetDraft({ ...presetDraft, tone: event.target.value })}
            />
            <Input
              label={t('settings.presets.alwaysInclude')}
              value={presetDraft.alwaysInclude}
              onChange={(event) =>
                setPresetDraft({ ...presetDraft, alwaysInclude: event.target.value })
              }
            />
            <Input
              label={t('settings.presets.neverUse')}
              value={presetDraft.neverUse}
              onChange={(event) => setPresetDraft({ ...presetDraft, neverUse: event.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={presetDelete !== null}
        title={t('settings.presets.deleteTitle')}
        description={t('settings.presets.deleteBody', { name: presetDelete?.name ?? '' })}
        onClose={() => setPresetDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPresetDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={busy === 'preset'}
              onClick={() => void handleDeletePreset()}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  )
}
