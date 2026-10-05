import Database from 'better-sqlite3'
import type { Database as SqliteDatabase } from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import { DB, DB_BACKUPS } from '@shared/constants'
import { MIGRATIONS, runMigrations } from '../../db/migrations'
import { seedPresets } from '../../db/repositories/presets'
import { getSetting, setSetting } from '../../db/repositories/settings'
import { scopedLogger } from '../logger'

const logger = scopedLogger('db')

export type { SqliteDatabase }

/**
 * Opens the database with pragmas but does NOT run migrations — initDb backs
 * the file up first (see backupBeforeMigration). Tests pass ':memory:'.
 * better-sqlite3 v13 ships Node-API prebuilds, so the same binary loads in
 * Electron and in Node (used by the Vitest suite) without any rebuild step.
 */
export function openDatabase(file?: string): SqliteDatabase {
  const db = new Database(file ?? join(app.getPath('userData'), DB.FILE_NAME))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export interface InitDbOptions {
  file?: string
  /** Values from the pre-database settings.json (0.2.0 installs), if present. */
  legacySettings?: Record<string, unknown>
}

let singleton: SqliteDatabase | null = null

/**
 * Opens the app database once; must be awaited during bootstrap BEFORE any
 * IPC handler is registered. Backs the file up first when migrations are
 * pending, then runs migrations and seeds.
 */
export async function initDb(options: InitDbOptions = {}): Promise<SqliteDatabase> {
  if (singleton) return singleton
  const file = options.file ?? join(app.getPath('userData'), DB.FILE_NAME)
  const db = openDatabase(file)
  singleton = db
  try {
    await backupBeforeMigration(db, file)
  } catch (error) {
    logger.error('Database backup before migration failed; continuing with migrations', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  runMigrations(db)
  seedPresets(db)
  seedLegacySettings(db, options.legacySettings)
  logger.info('Database ready', { file: db.name })
  return db
}

export function getDb(): SqliteDatabase {
  if (!singleton) {
    throw new Error('Database not initialized. Await initDb() during bootstrap first.')
  }
  return singleton
}

/**
 * Before applying pending migrations, copies the database file into
 * `<userData>/backups/` via better-sqlite3's online backup (safe while the
 * db is open, includes the WAL content). Keeps only the newest few backups.
 * Returns the backup path, or null when there is nothing to back up
 * (fresh database, in-memory database, or no pending migrations).
 */
export async function backupBeforeMigration(
  db: SqliteDatabase,
  dbFile: string,
  keepCount: number = DB_BACKUPS.KEEP_COUNT,
): Promise<string | null> {
  if (dbFile === ':memory:') return null
  if (!existsSync(dbFile)) return null // brand-new database, nothing to protect
  const currentVersion = db.pragma('user_version', { simple: true }) as number
  const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? currentVersion
  if (currentVersion >= latestVersion) return null

  const backupsDir = join(dirname(dbFile), DB_BACKUPS.DIRECTORY_NAME)
  await fs.mkdir(backupsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destination = join(
    backupsDir,
    `${basename(dbFile, '.db')}-pre-migration-v${currentVersion}-${stamp}.db`,
  )
  await db.backup(destination)

  // Prune: keep only the newest keepCount backups.
  const entries = await fs.readdir(backupsDir)
  const backups = entries
    .filter((name) => name.endsWith('.db'))
    .map((name) => join(backupsDir, name))
    .sort()
  for (const path of backups.slice(0, Math.max(0, backups.length - keepCount))) {
    await fs.rm(path, { force: true }).catch(() => {})
  }
  logger.info('Database backed up before migration', {
    from: dbFile,
    to: destination,
    currentVersion,
    latestVersion,
  })
  return destination
}

/**
 * One-time import of the pre-database settings file: known keys move into
 * SQLite if they are not set yet. The file itself is left in place as a
 * backup and never read again.
 */
export function seedLegacySettings(db: SqliteDatabase, legacy?: Record<string, unknown>): void {
  if (getSetting(db, 'legacySettingsImported')) return
  if (legacy) {
    for (const key of ['model', 'maxConcurrentRequests']) {
      const value = legacy[key]
      if (value !== undefined && getSetting(db, key) === undefined) {
        setSetting(db, key, value)
      }
    }
  }
  setSetting(db, 'legacySettingsImported', true)
}
