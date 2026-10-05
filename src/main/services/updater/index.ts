import { app } from 'electron'
import { UPDATER } from '@shared/constants'
import type { UpdateChannel, UpdaterEvent } from '@shared/ipc'
import { scopedLogger } from '../logger'

const logger = scopedLogger('updater')

/**
 * Minimal structural surface of electron-updater's AppUpdater that this
 * service uses. The real autoUpdater satisfies it; tests inject a fake.
 */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  channel: string | null
  allowPrerelease: boolean
  logger: unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
}

export interface UpdaterDeps {
  /** Pushes typed events to the renderer (main window webContents.send). */
  emit: (event: UpdaterEvent) => void
  isPackaged?: boolean
  now?: () => number
}

export interface UpdateCheckOutcome {
  started: boolean
  reason: string | null
}

export interface UpdaterService {
  /** Wires autoUpdater events; call once. */
  wire(): void
  applyChannel(channel: UpdateChannel): void
  checkForUpdates(): Promise<UpdateCheckOutcome>
  quitAndInstall(): boolean
}

interface DownloadProgressLike {
  percent: number
  bytesPerSecond: number
}

/**
 * Wraps electron-updater: maps its callbacks onto the typed UpdaterEvent
 * stream, throttles download progress, applies the stable/beta channel, and
 * guards manual checks (one at a time; never in dev builds).
 */
export function createUpdaterService(autoUpdater: UpdaterLike, deps: UpdaterDeps): UpdaterService {
  const isPackaged = deps.isPackaged ?? app.isPackaged
  const now = deps.now ?? (() => Date.now())
  const emit = deps.emit
  let wired = false
  let checkInFlight = false
  let downloadedVersion: string | null = null
  let lastProgressAt = 0

  return {
    wire(): void {
      if (wired) return
      wired = true

      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.on('checking-for-update', () => {
        emit({ type: 'checking' })
      })
      autoUpdater.on('update-available', (info: unknown) => {
        const version = (info as { version?: string } | null)?.version ?? 'unknown'
        logger.info('Update available', { version })
        emit({ type: 'available', version })
      })
      autoUpdater.on('update-not-available', () => {
        logger.info('No update available')
        emit({ type: 'not-available' })
      })
      autoUpdater.on('download-progress', (progress: unknown) => {
        const p = progress as DownloadProgressLike
        const at = now()
        // Throttle: electron-updater fires this many times per second.
        if (at - lastProgressAt < UPDATER.PROGRESS_THROTTLE_MS) return
        lastProgressAt = at
        emit({
          type: 'downloading',
          percent: Math.round(p.percent),
          bytesPerSecond: Math.round(p.bytesPerSecond),
        })
      })
      autoUpdater.on('update-downloaded', (info: unknown) => {
        downloadedVersion = (info as { version?: string } | null)?.version ?? 'unknown'
        logger.info('Update downloaded', { version: downloadedVersion })
        emit({ type: 'downloaded', version: downloadedVersion })
      })
      autoUpdater.on('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('Updater error', { message })
        emit({ type: 'error', message })
      })
    },

    applyChannel(channel: UpdateChannel): void {
      // The GitHub provider maps the channel onto pre-release builds: beta
      // installs versions published as prereleases, stable ignores them.
      autoUpdater.channel = channel
      autoUpdater.allowPrerelease = channel === 'beta'
      logger.info('Update channel applied', { channel })
    },

    async checkForUpdates(): Promise<UpdateCheckOutcome> {
      if (!isPackaged) {
        return {
          started: false,
          reason: 'Updates are only available in installed builds.',
        }
      }
      if (checkInFlight) {
        return { started: false, reason: 'An update check is already running.' }
      }
      checkInFlight = true
      logger.info('Checking for updates')
      try {
        await autoUpdater.checkForUpdates()
        // Errors surface through the 'error' listener above.
        return { started: true, reason: null }
      } catch (error) {
        logger.error('Update check failed', {
          error: error instanceof Error ? error.stack : String(error),
        })
        return { started: true, reason: null }
      } finally {
        checkInFlight = false
      }
    },

    quitAndInstall(): boolean {
      if (!downloadedVersion) {
        logger.warn('Install requested but no downloaded update is pending')
        return false
      }
      logger.info('Quitting to install update', { version: downloadedVersion })
      autoUpdater.quitAndInstall()
      return true
    },
  }
}
