import { IPC_CHANNELS, exportCsvRequestSchema } from '@shared/ipc'
import { exportService } from '../services/export'
import { registerIpcHandler } from './wrapper'

export function registerCsvHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.EXPORT_CSV, exportCsvRequestSchema, (request) =>
    exportService.exportCsv(request.rows, { projectId: request.projectId }),
  )
}
