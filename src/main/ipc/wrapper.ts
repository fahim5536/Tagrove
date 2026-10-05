import { ipcMain } from 'electron'
import type { z } from 'zod'
import { ipcFailure, ipcSuccess } from '@shared/ipc'
import type { IpcChannel, IpcResult } from '@shared/ipc'
import { AppError } from '../lib/errors'
import { scopedLogger } from '../services/logger'

const logger = scopedLogger('ipc')

type IpcRequestHandler<TRequest, TResponse> = (request: TRequest) => Promise<TResponse> | TResponse

/**
 * Registers an invoke handler that validates the raw request with the
 * channel's zod schema and wraps the outcome in the IpcResult envelope.
 * Handlers throw AppError for expected failures; anything else becomes a
 * generic INTERNAL error with the message preserved.
 */
export function registerIpcHandler<TRequest, TResponse>(
  channel: IpcChannel,
  schema: z.ZodType<TRequest>,
  handler: IpcRequestHandler<TRequest, TResponse>,
): void {
  ipcMain.handle(channel, async (_event, rawRequest: unknown): Promise<IpcResult<TResponse>> => {
    const parsed = schema.safeParse(rawRequest)
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
        .join('; ')
      logger.warn('Rejected invalid IPC request', { channel, details })
      return ipcFailure('VALIDATION', `Invalid request for '${channel}': ${details}`)
    }

    try {
      logger.debug('IPC request', { channel })
      const data = await handler(parsed.data)
      return ipcSuccess(data)
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn('IPC request failed', { channel, code: error.code, message: error.message })
        return ipcFailure(error.code, error.message)
      }
      logger.error('IPC handler crashed', {
        channel,
        error: error instanceof Error ? error.stack : String(error),
      })
      return ipcFailure('INTERNAL', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
