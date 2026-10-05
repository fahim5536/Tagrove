import { z } from 'zod'
import {
  APPEARANCE,
  EXPORT,
  GENERATION,
  GEMINI,
  IMAGES,
  LANGUAGES,
  LOG_LEVELS,
  UPDATER,
} from './constants'
import type {
  AppInfo,
  Category,
  IpcErrorCode,
  IpcResult,
  ImportedImage,
  Preset,
  ProjectDetail,
  ProjectSummary,
  RejectedFile,
  SettingsState,
  TestConnectionResult,
  ThumbnailData,
  UpdateCheckResult,
} from './types'

/** Re-exported so consumers can treat this file as the single contract module. */
export type {
  AppInfo,
  Category,
  IpcErrorCode,
  IpcResult,
  ImportedImage,
  Preset,
  ProjectDetail,
  ProjectSummary,
  RejectedFile,
  SettingsState,
  TestConnectionResult,
  ThumbnailData,
  UpdateChannel,
  UpdateCheckResult,
} from './types'

/**
 * The single source of truth for every renderer ↔ main interaction: channel
 * names, zod request schemas, the main→renderer event schema, and the typed
 * API surface exposed to the renderer.
 *
 * Invoke channels follow the 7-step recipe in ARCHITECTURE.md §5; main→renderer
 * events (generation progress) follow the GENERATION_EVENT pattern: main sends
 * via webContents.send, the preload exposes an onEvent() subscription, and the
 * renderer validates each payload with the zod event schema.
 */
export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  CONFIG_GET_CATEGORIES: 'config:get-categories',
  SETTINGS_GET_STATE: 'settings:get-state',
  SETTINGS_SET_API_KEY: 'settings:set-api-key',
  SETTINGS_CLEAR_API_KEY: 'settings:clear-api-key',
  SETTINGS_SET_MODEL: 'settings:set-model',
  SETTINGS_SET_GENERATION: 'settings:set-generation',
  SETTINGS_SET_EXPORT: 'settings:set-export',
  SETTINGS_SET_APPEARANCE: 'settings:set-appearance',
  SETTINGS_SET_LANGUAGE: 'settings:set-language',
  SETTINGS_SET_CRASH_REPORTS: 'settings:set-crash-reports',
  IMAGES_PICK_FILES: 'images:pick-files',
  IMAGES_ADD: 'images:add',
  IMAGES_RELINK: 'images:relink',
  IMAGES_GET_THUMBNAIL: 'images:get-thumbnail',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_GET_ACTIVE: 'projects:get-active',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_SET_ACTIVE: 'projects:set-active',
  PROJECTS_RENAME: 'projects:rename',
  PROJECTS_DUPLICATE: 'projects:duplicate',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_SAVE_METADATA: 'projects:save-metadata',
  PROJECTS_SET_AI_GENERATED: 'projects:set-ai-generated',
  PRESETS_LIST: 'presets:list',
  PRESETS_SAVE: 'presets:save',
  PRESETS_DELETE: 'presets:delete',
  GENERATION_START: 'generation:start',
  GENERATION_CANCEL: 'generation:cancel',
  GENERATION_EVENT: 'generation:event',
  AI_TEST_CONNECTION: 'ai:test-connection',
  EXPORT_CSV: 'export:csv',
  DATA_OPEN_FOLDER: 'data:open-folder',
  DATA_CHOOSE_FOLDER: 'data:choose-folder',
  DATA_CLEAR_CACHE: 'data:clear-cache',
  DATA_EXPORT_CONFIG: 'data:export-config',
  DATA_IMPORT_CONFIG: 'data:import-config',
  UPDATER_CHECK: 'updater:check',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_SET_CHANNEL: 'updater:set-channel',
  UPDATER_EVENT: 'updater:event',
  DIAGNOSTICS_COPY: 'diagnostics:copy',
  LOG_WRITE: 'log:write',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ---------------------------------------------------------------------------
// Request schemas (validated in the main process before any handler runs)
// ---------------------------------------------------------------------------

/** For channels that take no payload. */
export const noPayloadSchema = z.undefined()

export const setApiKeyRequestSchema = z.object({
  apiKey: z.string().min(1, 'API key must not be empty').max(512, 'API key is too long'),
})

const modelNameRegex = new RegExp(GEMINI.MODEL_NAME_PATTERN, 'i')

export const setModelRequestSchema = z.object({
  model: z
    .string()
    .trim()
    .min(3, 'Model name is too short')
    .max(100, 'Model name is too long')
    .regex(modelNameRegex, 'Model name contains invalid characters'),
})

const imageEdgeValues = GEMINI.IMAGE_EDGE_OPTIONS.map(String)
export const setGenerationOptionsRequestSchema = z.object({
  maxConcurrentRequests: z
    .number()
    .int()
    .min(GENERATION.MIN_CONCURRENCY)
    .max(GENERATION.MAX_CONCURRENCY)
    .optional(),
  modelImageEdge: z
    .number()
    .int()
    .refine((edge) => imageEdgeValues.includes(String(edge)), 'Unsupported image size')
    .optional(),
  maxRetries: z.number().int().min(0).max(GENERATION.MAX_RETRIES_LIMIT).optional(),
})

export const setExportOptionsRequestSchema = z.object({
  exportDefaultDir: z.string().max(500).nullable().optional(),
  csvEncoding: z.enum(EXPORT.CSV_ENCODINGS).optional(),
  filenamePattern: z.string().trim().min(1).max(120).optional(),
})

export const setAppearanceRequestSchema = z.object({
  appearance: z.enum(APPEARANCE.MODES),
})

export const setUpdateChannelRequestSchema = z.object({
  channel: z.enum(UPDATER.CHANNELS),
})

/** Events pushed from main over UPDATER_EVENT while an update cycle runs. */
export const updaterEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checking') }),
  z.object({ type: z.literal('available'), version: z.string().min(1) }),
  z.object({ type: z.literal('not-available') }),
  z.object({
    type: z.literal('downloading'),
    percent: z.number().min(0).max(100),
    bytesPerSecond: z.number().min(0),
  }),
  z.object({ type: z.literal('downloaded'), version: z.string().min(1) }),
  z.object({ type: z.literal('error'), message: z.string().min(1) }),
])

export type UpdaterEvent = z.infer<typeof updaterEventSchema>

export const setLanguageRequestSchema = z.object({
  language: z.enum(LANGUAGES.CODES),
})

export const setCrashReportsRequestSchema = z.object({
  enabled: z.boolean(),
})

export const addImagesRequestSchema = z.object({
  paths: z
    .array(z.string().min(1).max(1000))
    .min(1, 'No files were provided')
    .max(IMAGES.MAX_IMPORT_FILES),
})

export const relinkImageRequestSchema = z.object({
  imageId: z.string().min(1).max(100),
})

export const thumbnailRequestSchema = z.object({
  path: z.string().min(1).max(1000),
})

const idSchema = z.string().min(1).max(100)

export const projectIdRequestSchema = z.object({ id: idSchema })

export const projectNameRequestSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, 'Name must not be empty').max(120),
})

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
})

export const setAiGeneratedRequestSchema = z.object({
  id: idSchema,
  aiGenerated: z.boolean(),
})

export const saveMetadataRequestSchema = z.object({
  imageId: idSchema,
  patch: z.object({
    title: z.string().max(4000),
    keywords: z.array(z.string().max(200)).max(500),
    categoryId: z.string().max(100).nullable(),
  }),
})

export const presetRequestSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'Name must not be empty').max(80),
  extraInstructions: z.string().max(4000),
  keywordMin: z.number().int().min(1).max(99).nullable(),
  keywordMax: z.number().int().min(1).max(99).nullable(),
  tone: z.string().max(120),
  alwaysInclude: z.array(z.string().min(1).max(100)).max(60),
  neverUse: z.array(z.string().min(1).max(100)).max(120),
})

export const generationStartRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: idSchema,
        path: z.string().min(1).max(1000),
      }),
    )
    .min(1, 'There are no images to generate')
    .max(IMAGES.MAX_IMPORT_FILES),
  presetId: idSchema.nullable().optional(),
})

export const exportCsvRequestSchema = z.object({
  projectId: idSchema.optional(),
  rows: z
    .array(
      z.object({
        fileName: z.string().min(1).max(500),
        title: z.string().max(4000),
        keywords: z.array(z.string().max(200)).max(500),
        categoryId: z.string().max(100).nullable(),
      }),
    )
    .max(IMAGES.MAX_IMPORT_FILES),
})

export const logWriteSchema = z.object({
  level: z.enum(LOG_LEVELS),
  message: z.string().min(1).max(4000),
  context: z.record(z.string(), z.unknown()).optional(),
})

export type SetApiKeyRequest = z.infer<typeof setApiKeyRequestSchema>
export type SetModelRequest = z.infer<typeof setModelRequestSchema>
export type SetGenerationOptionsRequest = z.infer<typeof setGenerationOptionsRequestSchema>
export type SetExportOptionsRequest = z.infer<typeof setExportOptionsRequestSchema>
export type SetAppearanceRequest = z.infer<typeof setAppearanceRequestSchema>
export type SetLanguageRequest = z.infer<typeof setLanguageRequestSchema>
export type SetCrashReportsRequest = z.infer<typeof setCrashReportsRequestSchema>
export type SetUpdateChannelRequest = z.infer<typeof setUpdateChannelRequestSchema>
export type AddImagesRequest = z.infer<typeof addImagesRequestSchema>
export type RelinkImageRequest = z.infer<typeof relinkImageRequestSchema>
export type ThumbnailRequest = z.infer<typeof thumbnailRequestSchema>
export type ProjectIdRequest = z.infer<typeof projectIdRequestSchema>
export type ProjectNameRequest = z.infer<typeof projectNameRequestSchema>
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>
export type SetAiGeneratedRequest = z.infer<typeof setAiGeneratedRequestSchema>
export type SaveMetadataRequest = z.infer<typeof saveMetadataRequestSchema>
export type PresetRequest = z.infer<typeof presetRequestSchema>
export type GenerationStartRequest = z.infer<typeof generationStartRequestSchema>
export type ExportCsvRequest = z.infer<typeof exportCsvRequestSchema>
export type LogWriteRequest = z.infer<typeof logWriteSchema>

// ---------------------------------------------------------------------------
// Main → renderer events (sent via webContents.send, validated in the renderer)
// ---------------------------------------------------------------------------

export const generationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run-started'), total: z.number().int().positive() }),
  z.object({ type: z.literal('item-started'), id: z.string().min(1) }),
  z.object({
    type: z.literal('item-completed'),
    id: z.string().min(1),
    metadata: z.object({
      title: z.string(),
      keywords: z.array(z.string()),
      categoryId: z.string().nullable(),
    }),
  }),
  z.object({
    type: z.literal('item-failed'),
    id: z.string().min(1),
    message: z.string().min(1),
    code: z.string(),
  }),
  z.object({
    type: z.literal('run-finished'),
    canceled: z.boolean(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
])

export type GenerationEvent = z.infer<typeof generationEventSchema>

export interface GenerationStartItem {
  id: string
  path: string
}

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

export function ipcSuccess<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcFailure(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

// ---------------------------------------------------------------------------
// Renderer-facing API surface
// ---------------------------------------------------------------------------

/** Implemented in src/preload/index.ts and consumed by the renderer as window.api. */
export interface TagroveApi {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>
  }
  config: {
    getCategories: () => Promise<IpcResult<{ categories: Array<Category> }>>
  }
  settings: {
    getState: () => Promise<IpcResult<SettingsState>>
    setApiKey: (request: SetApiKeyRequest) => Promise<IpcResult<SettingsState>>
    clearApiKey: () => Promise<IpcResult<SettingsState>>
    setModel: (request: SetModelRequest) => Promise<IpcResult<SettingsState>>
    setGenerationOptions: (
      request: SetGenerationOptionsRequest,
    ) => Promise<IpcResult<SettingsState>>
    setExportOptions: (request: SetExportOptionsRequest) => Promise<IpcResult<SettingsState>>
    setAppearance: (request: SetAppearanceRequest) => Promise<IpcResult<SettingsState>>
    setLanguage: (request: SetLanguageRequest) => Promise<IpcResult<SettingsState>>
    setCrashReports: (request: SetCrashReportsRequest) => Promise<IpcResult<SettingsState>>
  }
  images: {
    /** Maps a drag-and-drop File to its absolute path (Electron webUtils). */
    getPathForFile: (file: File) => string
    pickFiles: () => Promise<IpcResult<{ paths: Array<string> }>>
    /** Validates, hashes, deduplicates, and inserts files into the active project. */
    add: (request: AddImagesRequest) => Promise<
      IpcResult<{
        accepted: Array<ImportedImage>
        rejected: Array<RejectedFile>
        duplicates: number
      }>
    >
    relink: (request: RelinkImageRequest) => Promise<IpcResult<{ image: ImportedImage | null }>>
    getThumbnail: (request: ThumbnailRequest) => Promise<IpcResult<ThumbnailData>>
  }
  projects: {
    list: () => Promise<IpcResult<{ projects: Array<ProjectSummary> }>>
    get: (request: ProjectIdRequest) => Promise<IpcResult<{ project: ProjectDetail }>>
    getActive: () => Promise<IpcResult<{ project: ProjectDetail | null }>>
    create: (request: CreateProjectRequest) => Promise<IpcResult<{ project: ProjectSummary }>>
    setActive: (request: ProjectIdRequest) => Promise<IpcResult<{ activeProjectId: string }>>
    rename: (request: ProjectNameRequest) => Promise<IpcResult<{ project: ProjectSummary }>>
    duplicate: (request: ProjectIdRequest) => Promise<IpcResult<{ project: ProjectSummary }>>
    delete: (request: ProjectIdRequest) => Promise<IpcResult<{ deleted: boolean }>>
    saveMetadata: (request: SaveMetadataRequest) => Promise<IpcResult<{ saved: boolean }>>
    setAiGenerated: (
      request: SetAiGeneratedRequest,
    ) => Promise<IpcResult<{ project: ProjectSummary }>>
  }
  presets: {
    list: () => Promise<IpcResult<{ presets: Array<Preset> }>>
    save: (request: PresetRequest) => Promise<IpcResult<{ preset: Preset }>>
    delete: (request: ProjectIdRequest) => Promise<IpcResult<{ deleted: boolean }>>
  }
  generation: {
    start: (request: GenerationStartRequest) => Promise<IpcResult<{ started: boolean }>>
    cancel: () => Promise<IpcResult<{ canceled: boolean }>>
    /** Subscribes to run progress; returns an unsubscribe function. */
    onEvent: (listener: (event: GenerationEvent) => void) => () => void
  }
  ai: {
    testConnection: () => Promise<IpcResult<TestConnectionResult>>
  }
  csv: {
    export: (request: ExportCsvRequest) => Promise<IpcResult<{ filePath: string | null }>>
  }
  data: {
    openFolder: () => Promise<IpcResult<{ opened: boolean }>>
    chooseFolder: () => Promise<IpcResult<{ dir: string | null }>>
    clearCache: () => Promise<IpcResult<{ cleared: number }>>
    exportConfig: () => Promise<IpcResult<{ filePath: string | null }>>
    importConfig: () => Promise<IpcResult<{ imported: boolean; message: string }>>
  }
  updater: {
    checkForUpdates: () => Promise<IpcResult<UpdateCheckResult>>
    install: () => Promise<IpcResult<{ installing: boolean }>>
    setChannel: (request: SetUpdateChannelRequest) => Promise<IpcResult<SettingsState>>
    /** Subscribes to update progress; returns an unsubscribe function. */
    onEvent: (listener: (event: UpdaterEvent) => void) => () => void
  }
  diagnostics: {
    /** Builds a redacted diagnostics report and copies it to the clipboard. */
    copy: () => Promise<IpcResult<{ copied: boolean }>>
  }
  log: {
    write: (entry: LogWriteRequest) => Promise<IpcResult<null>>
  }
}
