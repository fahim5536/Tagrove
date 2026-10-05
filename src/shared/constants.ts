/**
 * Application-wide configuration. Every tunable value lives here — feature
 * code must not hard-code sizes, file names, policies, or channel names.
 */

export const APP_NAME = 'Tagrove'
export const APP_DESCRIPTION = 'Generate Adobe Stock metadata for images with AI.'

export const WINDOW = {
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 800,
  MIN_WIDTH: 1024,
  MIN_HEIGHT: 640,
  BACKGROUND_COLOR: '#0A0D13',
} as const

export const LOG = {
  FILE_NAME: 'tagrove.log',
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
  FILE_FORMAT: '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}',
} as const

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export const STORAGE = {
  SECRETS_FILE: 'secrets.json',
  LEGACY_SETTINGS_FILE: 'settings.json',
} as const

export const DB = {
  FILE_NAME: 'tagrove.db',
} as const

/**
 * Former app identity, before the 0.3.1 rename to Tagrove. Referenced ONLY by
 * the one-time user data migration (src/main/lib/userDataMove.ts) so the
 * database, settings, and API key from an existing StockMeta install carry
 * over. Do not use it anywhere else.
 */
export const LEGACY_USER_DATA = {
  FOLDER_NAME: 'StockMeta',
  DB_FILE_NAME: 'stockmeta.db',
} as const

export const GEMINI = {
  DEFAULT_MODEL: 'gemini-2.5-flash',
  KNOWN_MODELS: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  MODEL_NAME_PATTERN: '^[A-Za-z0-9._\\-]+$',
  /** Default cap for the long edge of images sent to the model (a setting). */
  DEFAULT_IMAGE_EDGE: 1024,
  IMAGE_EDGE_OPTIONS: [512, 768, 1024, 1536],
  MODEL_JPEG_QUALITY: 85,
  TEMPERATURE: 0.3,
} as const

export const GENERATION = {
  DEFAULT_CONCURRENCY: 3,
  MIN_CONCURRENCY: 1,
  MAX_CONCURRENCY: 8,
  /** Default retries per image on rate limits / network errors (a setting, 0–5). */
  DEFAULT_MAX_RETRIES: 3,
  MAX_RETRIES_LIMIT: 5,
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 15000,
} as const

export const IMAGES = {
  SUPPORTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
  THUMBNAIL_EDGE: 240,
  THUMBNAIL_JPEG_QUALITY: 80,
  /** Max thumbnails kept in the main-process LRU cache. */
  CACHE_MAX_ENTRIES: 1000,
  MAX_FILE_BYTES: 100 * 1024 * 1024,
  MAX_IMPORT_FILES: 2000,
} as const

export const EXPORT = {
  CSV_ENCODINGS: ['utf8-bom', 'utf8'] as const,
  DEFAULT_CSV_ENCODING: 'utf8-bom' as const,
  DEFAULT_FILENAME_PATTERN: '{project}-{date}',
  /** Written into the Releases column when a project is marked AI-generated. */
  AI_RELEASES_MARKER: 'ai-generated',
  CSV_FILENAME_EXTENSION: '.csv',
} as const

export const APPEARANCE = {
  MODES: ['dark', 'light', 'system'] as const,
  DEFAULT: 'dark' as const,
  LIGHT_BACKGROUND_COLOR: '#F2F4F8',
} as const

export const LANGUAGES = {
  CODES: ['en', 'bn'] as const,
  DEFAULT: 'en' as const,
} as const

export const UPDATER = {
  CHANNELS: ['stable', 'beta'] as const,
  DEFAULT_CHANNEL: 'stable' as const,
  /** First update check happens this long after startup, to stay out of the way. */
  LAUNCH_CHECK_DELAY_MS: 10_000,
  /** Download-progress events are throttled to roughly this interval. */
  PROGRESS_THROTTLE_MS: 400,
} as const

export const DIAGNOSTICS = {
  /**
   * Crash reporting (Sentry) is opt-in and only active when a DSN is provided
   * through this environment variable — no DSN is stored in the repository.
   */
  SENTRY_DSN_ENV_VAR: 'TAGROVE_SENTRY_DSN',
  LOG_TAIL_BYTES: 64 * 1024,
  LOG_TAIL_LINES: 40,
} as const

export const DB_BACKUPS = {
  DIRECTORY_NAME: 'backups',
  KEEP_COUNT: 5,
} as const

function formatContentSecurityPolicy(directives: Record<string, string>): string {
  return Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join('; ')
}

/**
 * The production policy ships inside index.html as a <meta> tag. The renderer
 * config in electron.vite.config.ts swaps it for DEVELOPMENT while serving —
 * if you change these, update the meta tag in src/renderer/index.html to
 * match PRODUCTION exactly.
 */
export const CSP = {
  PRODUCTION: formatContentSecurityPolicy({
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data:",
    'font-src': "'self' data:",
    'connect-src': "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'none'",
  }),
  DEVELOPMENT: formatContentSecurityPolicy({
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'font-src': "'self' data:",
    'connect-src': "'self' ws://localhost:* http://localhost:*",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'none'",
  }),
} as const
