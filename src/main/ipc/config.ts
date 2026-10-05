import { IPC_CHANNELS, noPayloadSchema } from '@shared/ipc'
import { loadCategories } from '../config/lists'
import { registerIpcHandler } from './wrapper'

export function registerConfigHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.CONFIG_GET_CATEGORIES, noPayloadSchema, () => ({
    categories: loadCategories(),
  }))
}
