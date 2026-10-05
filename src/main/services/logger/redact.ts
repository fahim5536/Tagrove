const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[-_]?key|authorization|credential)/i
const REDACTED = '[REDACTED]'
const MAX_DEPTH = 8

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

/**
 * Recursively replaces values under secret-looking keys. Applied to every
 * electron-log record so an API key can never end up in the log file, no
 * matter which call site forgets to strip it.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH_EXCEEDED]'
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1))
  }
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSecretKey(key) ? REDACTED : redactSecrets(entry, depth + 1)
  }
  return result
}
