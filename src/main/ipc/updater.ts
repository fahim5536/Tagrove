import { autoUpdater } from 'electron-updater'
import { UPDATER } from '@shared/constants'
import { IPC_CHANNELS, noPayloadSchema, setUpdateChannelRequestSchema } from '@shared/ipc'
import type { UpdaterEvent } from '@shared/ipc'
import { createUpdaterService } from '../services/updater'
import { getDb } from '../services/db'
import { getSetting } from '../db/repositories/settings'
import { setUpdateChannel } from '../services/storage/settings'
import { getMainWindow } from '../window'
import { registerIpcHandler } from './wrapper'

export function registerUpdaterHandlers(): void {
  const service = createUpdaterService(autoUpdater, {
    emit: (event: UpdaterEvent) => {
      getMainWindow()?.webContents.send(IPC_CHANNELS.UPDATER_EVENT, event)
    },
  })
  service.wire()

  // Apply the saved channel (stable/beta) before the first check.
  const savedChannel = getSetting(getDb(), 'updateChannel')
  service.applyChannel(savedChannel === 'beta' ? 'beta' : 'stable')

  registerIpcHandler(IPC_CHANNELS.UPDATER_CHECK, noPayloadSchema, () => service.checkForUpdates())

  registerIpcHandler(IPC_CHANNELS.UPDATER_INSTALL, noPayloadSchema, () => ({
    installing: service.quitAndInstall(),
  }))

  registerIpcHandler(IPC_CHANNELS.UPDATER_SET_CHANNEL, setUpdateChannelRequestSchema, (request) =>
    setUpdateChannel(request.channel).then((state) => {
      service.applyChannel(state.updateChannel)
      return state
    }),
  )

  // First check shortly after startup so it never gets in the user's way.
  setTimeout(() => {
    void service.checkForUpdates()
  }, UPDATER.LAUNCH_CHECK_DELAY_MS)
}
