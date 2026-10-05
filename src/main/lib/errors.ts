import type { IpcErrorCode } from '@shared/types'

/**
 * Domain error carrying a machine-readable code that maps 1:1 to the IPC
 * error envelope. Services throw AppError for expected failures; the IPC
 * wrapper converts everything else into a generic INTERNAL error.
 */
export class AppError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class NotImplementedError extends AppError {
  constructor(feature: string) {
    super('NOT_IMPLEMENTED', `${feature} is not implemented yet. It is planned for a later phase.`)
    this.name = 'NotImplementedError'
  }
}
