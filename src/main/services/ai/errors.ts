import { AppError } from '../../lib/errors'

/** Thrown when the model reply cannot be parsed into the expected shape. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiOutputError'
  }
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** True for rate limits, server errors, and network problems — worth retrying with backoff. */
export function isRetryableAiError(error: unknown): boolean {
  const status = statusOf(error)
  if (status === 429) return true
  if (status !== null && status >= 500 && status < 600) return true

  const message = messageOf(error).toLowerCase()
  if (/abort|cancel/.test(message)) return false
  if (/429|resource_exhausted|rate.?limit|quota/.test(message)) return true
  if (
    /network|timeout|etimedout|econnaborted|econnrefused|enotfound|socket|fetch failed|server error|internal error|unavailable/.test(
      message,
    )
  ) {
    return true
  }
  return false
}

/** User-facing message for a final failure; technical details stay in the log. */
export function describeAiError(error: unknown): string {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message : String(error)

  if (status === 429 || /resource_exhausted|rate.?limit/i.test(message)) {
    return 'Rate limited by Google after several retries. Wait a minute and try again.'
  }
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && /api.?key/i.test(message)) ||
    /api.?key not valid|api_key_invalid|permission/i.test(message)
  ) {
    return 'The API key was rejected. Check it in Settings.'
  }
  if (status === 404 || (/not found/i.test(message) && /model/i.test(message))) {
    return 'The model name was not found. Check it in Settings.'
  }
  if (/abort/i.test(message)) return 'Canceled.'
  if (/network|timeout|fetch failed|econn|enotfound|socket/i.test(message)) {
    return 'Network error. Check your internet connection.'
  }
  if (error instanceof AppError) return error.message
  if (error instanceof AiOutputError) {
    return 'The AI kept returning an unreadable response. Try regenerating this image.'
  }
  return 'Generation failed. See the log file for technical details.'
}
