import { app } from 'electron'
import log from 'electron-log/main'
import { LOG } from '@shared/constants'
import type { LogLevel } from '@shared/types'
import { redactSecrets } from './redact'

export type LoggerContext = Record<string, unknown>

export interface Logger {
  log(level: LogLevel, message: string, context?: LoggerContext): void
  debug(message: string, context?: LoggerContext): void
  info(message: string, context?: LoggerContext): void
  warn(message: string, context?: LoggerContext): void
  error(message: string, context?: LoggerContext): void
}

let initialized = false

/**
 * Under Vitest, keep electron-log completely off the real user data folder:
 * tests that transitively import the logger would otherwise create
 * %APPDATA%/<app>/logs and pollute (or, worse, block) the one-time user data
 * migration on this machine.
 */
if (process.env.VITEST) {
  log.transports.file.level = false
  log.transports.file.resolvePathFn = () => '<disabled>'
}

/**
 * Wires electron-log: one log file per app in the user data folder, more
 * verbose in development, and secret redaction hooked into every record.
 * `log.initialize()` also captures console messages from renderers.
 */
export function initLogger(): void {
  if (initialized) return
  initialized = true

  log.initialize()
  log.transports.file.fileName = LOG.FILE_NAME
  log.transports.file.maxSize = LOG.MAX_FILE_SIZE_BYTES
  log.transports.file.format = LOG.FILE_FORMAT
  log.transports.file.level = app.isPackaged ? 'info' : 'debug'
  log.transports.console.level = app.isPackaged ? false : 'debug'
  log.hooks.push((message) => {
    message.data = redactSecrets(message.data) as unknown[]
    return message
  })
  logger.debug('Logger initialized')
}

function formatContext(context?: LoggerContext): string {
  if (!context) return ''
  try {
    return ` ${JSON.stringify(context)}`
  } catch {
    return ' [unserializable context]'
  }
}

function createLogger(scope?: string): Logger {
  const scoped = scope ? log.scope(scope) : log
  const write = (level: LogLevel, message: string, context?: LoggerContext): void => {
    scoped[level](`${message}${formatContext(context)}`)
  }
  return {
    log: write,
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  }
}

/** Root logger. Use scopedLogger('domain') inside services. */
export const logger = createLogger()

export function scopedLogger(scope: string): Logger {
  return createLogger(scope)
}

export function getLogFilePath(): string {
  return log.transports.file.getFile().path
}
