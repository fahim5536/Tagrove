import { promises as fs } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { DB, LEGACY_USER_DATA } from '@shared/constants'

/**
 * One-time user data migration for the 0.3.1 rename (StockMeta → Tagrove).
 *
 * Electron derives the userData folder from the app name, so after the rename
 * an existing install would start with an empty folder and all settings, the
 * SQLite database, and the safeStorage-encrypted API key would appear lost.
 * This module copies the former folder into the new one, verifies the copy
 * file-by-file, renames the database file to its new name, and writes a
 * marker — leaving the old folder untouched as a backup. The old folder's
 * name comes from LEGACY_USER_DATA in src/shared/constants.ts.
 */

export interface UserDataMoveOptions {
  oldPath: string
  newPath: string
  /** Injectable for tests; defaults to a recursive fs.cp merge. */
  copyDir?: (src: string, dest: string) => Promise<void>
  /** Injectable for tests. */
  pathExists?: (path: string) => Promise<boolean>
  /** Injectable for tests. */
  now?: () => Date
}

export type UserDataMoveReason =
  'same-path' | 'no-old-folder' | 'already-migrated' | 'new-folder-in-use' | 'migrated' | 'error'

export interface UserDataMoveResult {
  performed: boolean
  reason: UserDataMoveReason
  from?: string
  to?: string
  fileCount?: number
  renamedDatabase?: boolean
  error?: string
}

const MARKER_FILE = 'userdata-migrated.json'

/**
 * Files that count as real user data. The migration is skipped only when one
 * of these already exists in the new folder. Logs and Chromium caches
 * deliberately do NOT count: electron-log or an early Chromium start can
 * create those in the new folder before the migration runs, and they are not
 * worth blocking the migration over.
 */
function dataMarkers(): Array<string> {
  return [DB.FILE_NAME, LEGACY_USER_DATA.DB_FILE_NAME, 'secrets.json', 'settings.json', MARKER_FILE]
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

async function defaultCopyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dirname(dest), { recursive: true })
  await fs.cp(src, dest, { recursive: true, force: true, errorOnExist: false })
}

/** Walks every regular file under root: relative path → byte size. */
async function walkFiles(root: string): Promise<Map<string, number>> {
  const files = new Map<string, number>()
  const stack: Array<string> = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath)
        files.set(relative(root, fullPath), stat.size)
      }
    }
  }
  return files
}

async function verifyCopy(
  oldPath: string,
  newPath: string,
): Promise<{ ok: boolean; fileCount: number; problems: Array<string> }> {
  const oldFiles = await walkFiles(oldPath)
  const problems: Array<string> = []
  for (const [relativePath, size] of oldFiles) {
    try {
      const stat = await fs.stat(join(newPath, relativePath))
      if (stat.size !== size) {
        problems.push(`${relativePath} (size ${stat.size} != ${size})`)
      }
    } catch {
      problems.push(`${relativePath} (missing)`)
    }
  }
  return { ok: problems.length === 0, fileCount: oldFiles.size, problems }
}

/** Renames the copied database file to its new name (db, -wal, -shm). */
async function renameLegacyDatabase(
  newPath: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<boolean> {
  let renamed = false
  for (const suffix of ['', '-wal', '-shm']) {
    const from = join(newPath, `${LEGACY_USER_DATA.DB_FILE_NAME}${suffix}`)
    const to = join(newPath, `${DB.FILE_NAME}${suffix}`)
    if ((await pathExists(from)) && !(await pathExists(to))) {
      await fs.rename(from, to)
      renamed = true
    }
  }
  return renamed
}

export async function migrateLegacyUserData(
  options: UserDataMoveOptions,
): Promise<UserDataMoveResult> {
  const { oldPath, newPath } = options
  const pathExists = options.pathExists ?? defaultPathExists
  const copyDir = options.copyDir ?? defaultCopyDir

  if (oldPath === newPath) return { performed: false, reason: 'same-path' }
  if (!(await pathExists(oldPath))) return { performed: false, reason: 'no-old-folder' }
  if (await pathExists(join(newPath, MARKER_FILE))) {
    return { performed: false, reason: 'already-migrated' }
  }
  for (const marker of dataMarkers()) {
    if (await pathExists(join(newPath, marker))) {
      return { performed: false, reason: 'new-folder-in-use' }
    }
  }

  try {
    await copyDir(oldPath, newPath)
    const verification = await verifyCopy(oldPath, newPath)
    if (!verification.ok) {
      return {
        performed: false,
        reason: 'error',
        error: `copy verification failed: ${verification.problems.join(', ')}`,
      }
    }
    const renamedDatabase = await renameLegacyDatabase(newPath, pathExists)
    const fileCount = verification.fileCount
    const marker = {
      migratedAt: (options.now ?? (() => new Date()))().toISOString(),
      from: oldPath,
      to: newPath,
      fileCount,
      renamedDatabase,
    }
    await fs.writeFile(join(newPath, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
    return {
      performed: true,
      reason: 'migrated',
      from: oldPath,
      to: newPath,
      fileCount,
      renamedDatabase,
    }
  } catch (error) {
    return {
      performed: false,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
