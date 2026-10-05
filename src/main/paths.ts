import { app } from 'electron'
import { join } from 'node:path'
import { STORAGE } from '@shared/constants'

export interface AppPaths {
  userDataDir: string
  secretsFile: string
  legacySettingsFile: string
}

let cached: AppPaths | null = null

/** Resolves (and caches) the on-disk locations the storage services use. */
export function getAppPaths(): AppPaths {
  if (cached) return cached
  const userDataDir = app.getPath('userData')
  cached = {
    userDataDir,
    secretsFile: join(userDataDir, STORAGE.SECRETS_FILE),
    legacySettingsFile: join(userDataDir, STORAGE.LEGACY_SETTINGS_FILE),
  }
  return cached
}
