import {
  IPC_CHANNELS,
  noPayloadSchema,
  presetRequestSchema,
  projectIdRequestSchema,
} from '@shared/ipc'
import { getDb } from '../services/db'
import { deletePreset, getPreset, listPresets, savePreset } from '../db/repositories/presets'
import { registerIpcHandler } from './wrapper'

export function registerPresetsHandlers(): void {
  const db = () => getDb()

  registerIpcHandler(IPC_CHANNELS.PRESETS_LIST, noPayloadSchema, () => ({
    presets: listPresets(db()),
  }))

  registerIpcHandler(IPC_CHANNELS.PRESETS_SAVE, presetRequestSchema, (request) => ({
    preset: savePreset(db(), request),
  }))

  registerIpcHandler(IPC_CHANNELS.PRESETS_DELETE, projectIdRequestSchema, (request) => {
    if (!getPreset(db(), request.id)) {
      throw new Error('Preset not found')
    }
    return { deleted: deletePreset(db(), request.id) }
  })
}
