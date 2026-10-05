import { IPC_CHANNELS, noPayloadSchema } from '@shared/ipc'
import { copyDiagnosticsReport } from '../services/diagnostics'
import { registerIpcHandler } from './wrapper'

export function registerDiagnosticsHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.DIAGNOSTICS_COPY, noPayloadSchema, () =>
    copyDiagnosticsReport().then((copied) => ({ copied })),
  )
}
