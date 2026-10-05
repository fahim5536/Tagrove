import { IPC_CHANNELS, logWriteSchema } from '@shared/ipc'
import { scopedLogger } from '../services/logger'
import { captureErrorMessage } from '../services/diagnostics'
import { registerIpcHandler } from './wrapper'

const logger = scopedLogger('renderer')

/**
 * Forwards renderer-side diagnostics into the central log file. Payloads are
 * validated by logWriteSchema and every record passes through secret
 * redaction in the logger.
 */
export function registerLogHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.LOG_WRITE, logWriteSchema, (entry) => {
    logger.log(entry.level, entry.message, entry.context)
    // Forward renderer errors to crash reporting when the user opted in.
    if (entry.level === 'error') captureErrorMessage(entry.message)
    return null
  })
}
