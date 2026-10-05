import os from 'node:os'
import { statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { clipboard, app } from 'electron'
import { APP_NAME, DIAGNOSTICS } from '@shared/constants'
import { scopedLogger } from '../logger'
import { getLogFilePath } from '../logger'
import { getSettingsState } from '../storage/settings'
import type * as SentryElectronMain from '@sentry/electron/main'

const logger = scopedLogger('diagnostics')

type SentryModule = typeof SentryElectronMain

let sentry: SentryModule | null = null
let enabled = false

/**
 * Replaces anything that could identify the user's machine or folder layout:
 * the user data folder itself and absolute user paths (Windows + Unix).
 */
export function scrubPaths(text: string, userDataPath: string): string {
  return text
    .split(userDataPath)
    .join('[data folder]')
    .replace(/[A-Za-z]:\\Users\\[^\s"',;)]+/g, '[user path]')
    .replace(/\/Users\/[^\s"',;)]+/g, '[user path]')
    .replace(/\/home\/[^\s"',;)]+/g, '[user path]')
}

/** Extra line-level defense: the log file is already redacted at write time. */
export function scrubSensitiveLine(line: string): string {
  return line.replace(
    /("(?:apiKey|api-key|token|password|secret|authorization|credential)"\s*:\s*")[^"]*"/gi,
    '$1[REDACTED]"',
  )
}

/** Deep scrub for Sentry events: no paths, no machine/user identity. */
function scrubEvent(event: unknown, userDataPath: string): unknown {
  const asText = JSON.stringify(event)
  if (!asText) return event
  const scrubbed = scrubPaths(asText, userDataPath)
  try {
    const parsed = JSON.parse(scrubbed) as Record<string, unknown>
    delete parsed.server_name
    delete parsed.user
    return parsed
  } catch {
    return event
  }
}

/**
 * Initializes crash/error reporting when the user opted in AND a DSN is
 * configured through the environment (never stored in the repository).
 * Without a DSN the feature stays inert even when enabled.
 */
export async function initDiagnostics(): Promise<void> {
  const settings = await getSettingsState()
  const dsn = process.env[DIAGNOSTICS.SENTRY_DSN_ENV_VAR]
  if (!settings.crashReports) {
    logger.info('Crash reporting is off (opt-in setting)')
    return
  }
  if (!dsn) {
    logger.info('Crash reporting enabled but no DSN configured; staying inert')
    return
  }
  if (sentry) return

  try {
    sentry = await import('@sentry/electron/main')
    const userDataPath = app.getPath('userData')
    sentry.init({
      dsn,
      release: `tagrove@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      beforeSend: (event) => scrubEvent(event, userDataPath) as typeof event,
    })
    enabled = true
    logger.info('Crash reporting initialized')
  } catch (error) {
    logger.error('Failed to initialize crash reporting', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function setCrashReportsEnabled(next: boolean): void {
  if (next === enabled) return
  if (next) {
    void initDiagnostics()
    return
  }
  if (sentry) {
    const client = sentry.getClient()
    void client?.close(2000)
    sentry = null
  }
  enabled = false
  logger.info('Crash reporting disabled')
}

export function isDiagnosticsEnabled(): boolean {
  return enabled
}

/** Forwards renderer errors to Sentry when the user opted in. */
export function captureErrorMessage(message: string): void {
  if (!sentry || !enabled) return
  sentry.captureMessage(scrubPaths(message, app.getPath('userData')), 'error')
}

export function captureException(error: unknown): void {
  if (!sentry || !enabled) return
  sentry.captureException(error)
}

/** Reads the last N lines of the log file (already secret-redacted at write time). */
export async function readLogTail(logFilePath: string, lines: number): Promise<string> {
  try {
    const size = statSync(logFilePath).size
    const start = Math.max(0, size - DIAGNOSTICS.LOG_TAIL_BYTES)
    const handle = await open(logFilePath, 'r')
    try {
      const length = size - start
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, start)
      const all = buffer
        .toString('utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
      return all.slice(-lines).join('\n')
    } finally {
      await handle.close()
    }
  } catch {
    return '(log file unavailable)'
  }
}

/** Human-readable, clipboard-ready diagnostics report. Secrets never reach it. */
export async function buildDiagnosticsReport(): Promise<string> {
  const settings = await getSettingsState()
  const userDataPath = app.getPath('userData')
  const heapMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
  const uptimeMinutes = Math.round(process.uptime() / 60)

  const header = [
    `${APP_NAME} ${app.getVersion()}`,
    `Electron ${process.versions.electron} / Chromium ${process.versions.chrome} / Node ${process.versions.node}`,
    `Platform: ${process.platform} ${os.release()} ${process.arch}`,
    `Locale: ${app.getLocale()}`,
    `Update channel: ${settings.updateChannel}`,
    `Crash reports: ${settings.crashReports ? 'on' : 'off'}`,
    `Uptime: ~${uptimeMinutes} min`,
    `Memory (heap used): ${heapMb} MB`,
    `Data folder: [data folder]`,
    `Log file: [data folder]\\logs\\tagrove.log`,
  ].join('\n')

  const rawTail = await readLogTail(getLogFilePath(), DIAGNOSTICS.LOG_TAIL_LINES)
  const tail = rawTail
    .split('\n')
    .map((line) => scrubPaths(scrubSensitiveLine(line), userDataPath))
    .join('\n')

  return `${header}\n\n--- Recent log lines (secrets redacted) ---\n${tail}`
}

/** Builds the report and puts it on the clipboard. */
export async function copyDiagnosticsReport(): Promise<boolean> {
  const report = await buildDiagnosticsReport()
  clipboard.writeText(report)
  logger.info('Diagnostics report copied to clipboard')
  return true
}
