import type { IpcErrorCode, IpcResult } from '@shared/types'

/** Error thrown by unwrapIpc when the main process returned a failure envelope. */
export class IpcCallError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'IpcCallError'
    this.code = code
  }
}

/** Unwraps an IpcResult; throws IpcCallError so failures flow through try/catch. */
export function unwrapIpc<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data
  throw new IpcCallError(result.error.code, result.error.message)
}
