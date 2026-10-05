import { safeStorage } from 'electron'
import { APPEARANCE, EXPORT, GENERATION, GEMINI, LANGUAGES, UPDATER } from '@shared/constants'
import type {
  AppearanceMode,
  CsvEncoding,
  LanguageCode,
  SettingsState,
  UpdateChannel,
} from '@shared/types'
import { setSetting, getSetting } from '../../db/repositories/settings'
import { getDb } from '../db'
import { AppError } from '../../lib/errors'
import { getAppPaths } from '../../paths'
import { scopedLogger } from '../logger'
import { readJsonFile, writeJsonFileAtomic } from './index'

const logger = scopedLogger('settings')

/**
 * Settings live in the SQLite settings table (key/value, JSON-encoded); the
 * Gemini API key stays in a separate safeStorage-encrypted file because it is
 * a secret. The pre-database settings.json is imported once at startup.
 */

interface SecretsFile {
  version: 1
  encryptedApiKey: string | null
}

function readStringSetting(key: string): string | undefined {
  const value = getSetting(getDb(), key)
  return typeof value === 'string' ? value : undefined
}

function readNumberSetting(key: string): number | undefined {
  const value = getSetting(getDb(), key)
  return typeof value === 'number' ? value : undefined
}

function persistSetting(key: string, value: unknown): void {
  setSetting(getDb(), key, value)
  setSetting(getDb(), 'updatedAt', new Date().toISOString())
}

export async function getSettingsState(): Promise<SettingsState> {
  return {
    hasApiKey: await hasStoredApiKey(),
    updatedAt: readStringSetting('updatedAt') ?? null,
    model: readStringSetting('model') ?? GEMINI.DEFAULT_MODEL,
    maxConcurrentRequests:
      readNumberSetting('maxConcurrentRequests') ?? GENERATION.DEFAULT_CONCURRENCY,
    modelImageEdge: readNumberSetting('modelImageEdge') ?? GEMINI.DEFAULT_IMAGE_EDGE,
    maxRetries: readNumberSetting('maxRetries') ?? GENERATION.DEFAULT_MAX_RETRIES,
    exportDefaultDir: readStringSetting('exportDefaultDir') ?? null,
    csvEncoding:
      (readStringSetting('csvEncoding') as CsvEncoding | undefined) ?? EXPORT.DEFAULT_CSV_ENCODING,
    filenamePattern: readStringSetting('filenamePattern') ?? EXPORT.DEFAULT_FILENAME_PATTERN,
    appearance:
      (readStringSetting('appearance') as AppearanceMode | undefined) ?? APPEARANCE.DEFAULT,
    language: (readStringSetting('language') as LanguageCode | undefined) ?? LANGUAGES.DEFAULT,
    updateChannel:
      (readStringSetting('updateChannel') as UpdateChannel | undefined) ?? UPDATER.DEFAULT_CHANNEL,
    crashReports: getSetting(getDb(), 'crashReports') === true,
    activeProjectId: readStringSetting('activeProjectId') ?? null,
    lastPresetId: readStringSetting('lastPresetId') ?? null,
  }
}

export async function setModel(model: string): Promise<SettingsState> {
  persistSetting('model', model)
  logger.info('Generation model updated', { model })
  return getSettingsState()
}

export interface GenerationOptions {
  maxConcurrentRequests?: number
  modelImageEdge?: number
  maxRetries?: number
}

export async function setGenerationOptions(options: GenerationOptions): Promise<SettingsState> {
  if (options.maxConcurrentRequests !== undefined) {
    persistSetting('maxConcurrentRequests', options.maxConcurrentRequests)
  }
  if (options.modelImageEdge !== undefined) {
    persistSetting('modelImageEdge', options.modelImageEdge)
  }
  if (options.maxRetries !== undefined) {
    persistSetting('maxRetries', options.maxRetries)
  }
  logger.info('Generation options updated', { ...options })
  return getSettingsState()
}

export interface ExportOptions {
  exportDefaultDir?: string | null
  csvEncoding?: CsvEncoding
  filenamePattern?: string
}

export async function setExportOptions(options: ExportOptions): Promise<SettingsState> {
  if (options.exportDefaultDir !== undefined) {
    persistSetting('exportDefaultDir', options.exportDefaultDir)
  }
  if (options.csvEncoding !== undefined) {
    persistSetting('csvEncoding', options.csvEncoding)
  }
  if (options.filenamePattern !== undefined) {
    persistSetting('filenamePattern', options.filenamePattern)
  }
  logger.info('Export options updated', { ...options })
  return getSettingsState()
}

export async function setAppearance(appearance: AppearanceMode): Promise<SettingsState> {
  persistSetting('appearance', appearance)
  logger.info('Appearance updated', { appearance })
  return getSettingsState()
}

export async function setLanguage(language: LanguageCode): Promise<SettingsState> {
  persistSetting('language', language)
  logger.info('Language updated', { language })
  return getSettingsState()
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<SettingsState> {
  persistSetting('updateChannel', channel)
  logger.info('Update channel updated', { channel })
  return getSettingsState()
}

export async function setCrashReports(enabled: boolean): Promise<SettingsState> {
  persistSetting('crashReports', enabled)
  logger.info('Crash reports setting updated', { enabled })
  return getSettingsState()
}

export async function setLastPresetId(presetId: string | null): Promise<void> {
  persistSetting('lastPresetId', presetId)
}

// ---------------------------------------------------------------------------
// Secrets (safeStorage-encrypted file; never exposed to the renderer)
// ---------------------------------------------------------------------------

async function readSecrets(): Promise<SecretsFile> {
  return readJsonFile<SecretsFile>(getAppPaths().secretsFile, {
    version: 1,
    encryptedApiKey: null,
  })
}

async function hasStoredApiKey(): Promise<boolean> {
  try {
    const secrets = await readSecrets()
    return typeof secrets.encryptedApiKey === 'string' && secrets.encryptedApiKey.length > 0
  } catch {
    return false
  }
}

export async function setApiKey(plainTextKey: string): Promise<SettingsState> {
  if (!safeStorage.isEncryptionAvailable()) {
    logger.error('Secure storage is unavailable; refusing to store the API key')
    throw new AppError(
      'UNAVAILABLE',
      'Secure storage is not available on this system, so the API key cannot be stored safely.',
    )
  }

  const encrypted = safeStorage.encryptString(plainTextKey)
  await writeJsonFileAtomic(getAppPaths().secretsFile, {
    version: 1,
    encryptedApiKey: encrypted.toString('base64'),
  } satisfies SecretsFile)
  persistSetting('updatedAt', new Date().toISOString())
  logger.info('API key updated', { keyLength: plainTextKey.length })
  return getSettingsState()
}

export async function clearApiKey(): Promise<SettingsState> {
  await writeJsonFileAtomic(getAppPaths().secretsFile, {
    version: 1,
    encryptedApiKey: null,
  } satisfies SecretsFile)
  persistSetting('updatedAt', new Date().toISOString())
  logger.info('API key cleared')
  return getSettingsState()
}

/**
 * Decrypts and returns the stored API key. This must only ever be called in
 * the main process; the renderer can only ask whether a key exists.
 */
export async function getApiKey(): Promise<string | null> {
  try {
    const secrets = await readSecrets()
    if (typeof secrets.encryptedApiKey !== 'string' || secrets.encryptedApiKey.length === 0) {
      return null
    }
    if (!safeStorage.isEncryptionAvailable()) {
      logger.error('Secure storage is unavailable; cannot decrypt the API key')
      return null
    }
    return safeStorage.decryptString(Buffer.from(secrets.encryptedApiKey, 'base64'))
  } catch (error) {
    logger.error('Could not decrypt the stored API key', {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export type ApiKeyReadability = 'ok' | 'missing' | 'unreadable'

/**
 * Distinguishes "no key stored" from "stored but undecryptable". Used after
 * the rename's user data migration: if the key cannot be decrypted (e.g. the
 * OS-level encryption key does not match), the user must re-enter it.
 */
export async function verifyApiKeyReadable(): Promise<ApiKeyReadability> {
  try {
    const secrets = await readSecrets()
    if (typeof secrets.encryptedApiKey !== 'string' || secrets.encryptedApiKey.length === 0) {
      return 'missing'
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return 'unreadable'
    }
    safeStorage.decryptString(Buffer.from(secrets.encryptedApiKey, 'base64'))
    return 'ok'
  } catch {
    return 'unreadable'
  }
}
