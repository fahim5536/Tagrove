import { IPC_CHANNELS, noPayloadSchema } from '@shared/ipc'
import { aiService } from '../services/ai'
import { registerIpcHandler } from './wrapper'

export function registerAiHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.AI_TEST_CONNECTION, noPayloadSchema, () =>
    aiService.testConnection(),
  )
}
