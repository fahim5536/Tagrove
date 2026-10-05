import { app, dialog } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { APP_NAME, LEGACY_USER_DATA } from '@shared/constants'
import { registerIpcHandlers } from './ipc'
import { registerSecurityGuards } from './security'
import { getAppPaths } from './paths'
import { initLogger, logger } from './services/logger'
import { initDb } from './services/db'
import { applyAppearance } from './lib/theme'
import { migrateLegacyUserData } from './lib/userDataMove'
import { getSettingsState, verifyApiKeyReadable } from './services/storage/settings'
import { captureException, initDiagnostics } from './services/diagnostics'
import { createMainWindow, getMainWindow } from './window'

function showFatalErrorDialog(message: string): void {
  try {
    dialog.showErrorBox(
      `${APP_NAME} — unexpected error`,
      `${message}\n\nDetails were written to the log file.`,
    )
  } catch {
    // The dialog itself failed; nothing left to do but keep the process alive.
  }
}

function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in the main process', {
      message: error.message,
      stack: error.stack,
    })
    captureException(error)
    showFatalErrorDialog(error.message)
  })
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    logger.error('Unhandled rejection in the main process', {
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    })
    showFatalErrorDialog(message)
  })
}

/** Reads the pre-database settings file (0.2.0 installs) for the one-time import. */
function readLegacySettings(): Record<string, unknown> | undefined {
  try {
    const { legacySettingsFile } = getAppPaths()
    if (!existsSync(legacySettingsFile)) return undefined
    const parsed = JSON.parse(readFileSync(legacySettingsFile, 'utf8')) as Record<string, unknown>
    logger.info('Found legacy settings file; values will be imported once')
    return parsed
  } catch {
    return undefined
  }
}

/**
 * One-time check after the rename: if the stored API key cannot be decrypted
 * (possible when the OS-level encryption key does not carry over), tell the
 * user clearly instead of failing silently at generation time.
 */
async function warnIfApiKeyUnreadable(): Promise<void> {
  const status = await verifyApiKeyReadable()
  if (status !== 'unreadable') return
  logger.error('Stored API key could not be decrypted; asking the user to re-enter it')
  await dialog.showMessageBox({
    type: 'warning',
    title: `${APP_NAME} — API key`,
    message: 'Your saved Gemini API key could not be decrypted.',
    detail:
      'This can happen when your app data was carried over from a previous version. Please open Settings and paste your API key again — it will be re-encrypted automatically.',
  })
}

async function bootstrap(): Promise<void> {
  // Must run before anything touches userData (logger, database): the rename
  // changed the userData folder, so an existing install's data has to be
  // carried over from the former folder. The old folder stays as a backup.
  const userDataMove = await migrateLegacyUserData({
    newPath: app.getPath('userData'),
    oldPath: join(dirname(app.getPath('userData')), LEGACY_USER_DATA.FOLDER_NAME),
  })
  initLogger()
  if (userDataMove.reason === 'migrated') {
    logger.info('Migrated user data from the previous app folder', {
      from: userDataMove.from,
      to: userDataMove.to,
      fileCount: userDataMove.fileCount,
      renamedDatabase: userDataMove.renamedDatabase,
    })
  } else if (userDataMove.reason === 'error') {
    logger.error('User data migration failed; starting with an empty profile', {
      error: userDataMove.error,
    })
  } else {
    logger.debug('User data migration skipped', { reason: userDataMove.reason })
  }
  registerProcessErrorHandlers()
  app.on('web-contents-created', (_event, contents) => registerSecurityGuards(contents))

  await app.whenReady()
  await initDb({ legacySettings: readLegacySettings() })
  registerIpcHandlers()
  // Apply the saved theme to nativeTheme and the window before showing it.
  applyAppearance((await getSettingsState()).appearance)
  // Opt-in crash reporting (no-op unless enabled and a DSN is configured).
  await initDiagnostics()
  await warnIfApiKeyUnreadable()
  createMainWindow()
  logger.info(`${APP_NAME} started`, { version: app.getVersion(), packaged: app.isPackaged })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  void bootstrap()
}
