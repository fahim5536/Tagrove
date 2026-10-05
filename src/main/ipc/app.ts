import { app } from 'electron'
import { APP_NAME } from '@shared/constants'
import { IPC_CHANNELS, noPayloadSchema } from '@shared/ipc'
import type { AppInfo } from '@shared/types'
import { getLogFilePath } from '../services/logger'
import { registerIpcHandler } from './wrapper'

export function getAppInfo(): AppInfo {
  return {
    appName: APP_NAME,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    nodeVersion: process.versions.node ?? 'unknown',
    platform: process.platform,
    locale: app.getLocale(),
    userDataPath: app.getPath('userData'),
    logFilePath: getLogFilePath(),
  }
}

export function registerAppHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.APP_GET_INFO, noPayloadSchema, () => getAppInfo())
}
