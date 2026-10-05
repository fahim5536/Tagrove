export type PageId = 'generate' | 'history' | 'settings' | 'about'

export interface PageMeta {
  titleKey: string
  descriptionKey: string
}

/** Page titles/descriptions are i18n keys resolved with useTranslation. */
export const PAGE_META: Record<PageId, PageMeta> = {
  generate: { titleKey: 'nav.generate', descriptionKey: 'generate.description' },
  history: { titleKey: 'nav.history', descriptionKey: 'history.description' },
  settings: { titleKey: 'nav.settings', descriptionKey: 'settings.description' },
  about: { titleKey: 'nav.about', descriptionKey: 'about.description' },
}

export const TOAST_DURATION_MS = 5000
export const MAX_TOASTS = 5

export const ROADMAP = {
  CURRENT_PHASE: 2,
  TOTAL_PHASES: 4,
  PROGRESS_PERCENT: 50,
  PHASES: [
    { id: 1, name: 'Core workflow: import, AI generation, editing, CSV export', status: 'done' },
    { id: 2, name: 'Projects & history (SQLite), presets, settings, productivity', status: 'done' },
    { id: 3, name: 'Auto-update (electron-updater), code signing', status: 'planned' },
    { id: 4, name: 'Polish: Bengali localization, refinements', status: 'planned' },
  ],
} as const

export type PhaseStatus = (typeof ROADMAP.PHASES)[number]['status']

/** Results table tuning. */
export const RESULTS_ROW_HEIGHT = 64
export const THUMBNAIL_VISIBLE_OVERSCAN = 5
/** Per-run failure toasts before suppressing duplicates (row errors stay visible in the table). */
export const MAX_FAILURE_TOASTS_PER_RUN = 3

/** Debounce for autosaving metadata edits to the database. */
export const AUTOSAVE_DEBOUNCE_MS = 600

/** Event name used to broadcast fresh settings from the Settings page to the app shell. */
export const SETTINGS_CHANGED_EVENT = 'tagrove:settings-changed'
