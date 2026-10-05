import type { LOG_LEVELS } from './constants'

export type LogLevel = (typeof LOG_LEVELS)[number]

export type IpcErrorCode =
  'VALIDATION' | 'INTERNAL' | 'UNAVAILABLE' | 'NOT_IMPLEMENTED' | 'NOT_FOUND'

export interface IpcSuccess<T> {
  ok: true
  data: T
}

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export interface IpcFailure {
  ok: false
  error: IpcError
}

/**
 * Every IPC response is an envelope so expected failures travel as data and
 * the renderer never has to guess whether an invoke() rejection is a bug or
 * a handled condition.
 */
export type IpcResult<T> = IpcSuccess<T> | IpcFailure

export interface Category {
  id: string
  name: string
}

export interface AppInfo {
  appName: string
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: string
  locale: string
  userDataPath: string
  logFilePath: string
}

export interface SettingsState {
  /** True when an encrypted API key exists. The key itself never leaves main. */
  hasApiKey: boolean
  updatedAt: string | null
  model: string
  maxConcurrentRequests: number
  modelImageEdge: number
  maxRetries: number
  exportDefaultDir: string | null
  csvEncoding: CsvEncoding
  filenamePattern: string
  appearance: AppearanceMode
  language: LanguageCode
  activeProjectId: string | null
  lastPresetId: string | null
  updateChannel: UpdateChannel
  /** Opt-in crash/error reporting (see PRIVACY.md). Default: off. */
  crashReports: boolean
}

export type UpdateChannel = 'stable' | 'beta'

export interface UpdateCheckResult {
  started: boolean
  /** Why a check did not start (dev build, check already running). */
  reason: string | null
}

/** One image accepted into a project by the import pipeline. */
export interface ImportedImage {
  id: string
  projectId: string
  path: string
  fileName: string
  sizeBytes: number
  lastModifiedMs: number
  missing: boolean
  fileHash: string | null
}

export interface RejectedFile {
  path: string
  reason: string
}

export interface ThumbnailData {
  dataUrl: string
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Phase 0.3.0: projects, presets, settings
// ---------------------------------------------------------------------------

export type CsvEncoding = 'utf8-bom' | 'utf8'

export type AppearanceMode = 'dark' | 'light' | 'system'

export type LanguageCode = 'en' | 'bn'

/** Row status for generation, shared by main (DB) and renderer (UI). */
export type GenerationItemStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'

export interface Preset {
  id: string
  name: string
  extraInstructions: string
  keywordMin: number | null
  keywordMax: number | null
  tone: string
  alwaysInclude: Array<string>
  neverUse: Array<string>
  isBuiltin: boolean
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  aiGenerated: boolean
  imageCount: number
  doneCount: number
  failedCount: number
  lastExportPath: string | null
}

export interface ProjectImage {
  id: string
  projectId: string
  path: string
  fileName: string
  sizeBytes: number
  lastModifiedMs: number
  missing: boolean
  sortOrder: number
  fileHash: string | null
  title: string
  keywords: Array<string>
  categoryId: string | null
  edited: boolean
  model: string | null
  presetId: string | null
  status: GenerationItemStatus
  error: string | null
  generatedAt: number | null
}

export interface ProjectDetail {
  project: ProjectSummary
  images: Array<ProjectImage>
}

export interface TestConnectionResult {
  ok: boolean
  latencyMs: number
  error: string | null
}
