import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyUserData } from './userDataMove'
import { DB, LEGACY_USER_DATA } from '@shared/constants'

let root: string
let oldPath: string

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

async function makeLegacyFolder(): Promise<void> {
  oldPath = join(root, LEGACY_USER_DATA.FOLDER_NAME)
  await fs.mkdir(join(oldPath, 'logs'), { recursive: true })
  await fs.mkdir(join(oldPath, 'Cache', 'nested'), { recursive: true })
  await fs.writeFile(join(oldPath, LEGACY_USER_DATA.DB_FILE_NAME), Buffer.alloc(100, 7))
  await fs.writeFile(join(oldPath, `${LEGACY_USER_DATA.DB_FILE_NAME}-wal`), Buffer.alloc(12, 1))
  await fs.writeFile(join(oldPath, 'settings.json'), '{"model":"gemini-2.5-flash"}')
  await fs.writeFile(join(oldPath, 'secrets.json'), '{"encryptedApiKey":"abc"}')
  await fs.writeFile(join(oldPath, 'logs', 'app.log'), 'log line\n')
  await fs.writeFile(join(oldPath, 'Cache', 'nested', 'blob.bin'), Buffer.alloc(32, 3))
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'tagrove-migration-'))
  await makeLegacyFolder()
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('migrateLegacyUserData', () => {
  it('copies, verifies, renames the database, and leaves the old folder untouched', async () => {
    const newPath = join(root, 'Tagrove')
    const oldDbBytes = await fs.readFile(join(oldPath, LEGACY_USER_DATA.DB_FILE_NAME))

    const result = await migrateLegacyUserData({ oldPath, newPath })

    expect(result).toMatchObject({
      performed: true,
      reason: 'migrated',
      from: oldPath,
      to: newPath,
      renamedDatabase: true,
    })
    expect(result.fileCount).toBe(6)

    // Database renamed and byte-identical.
    const newDb = await fs.readFile(join(newPath, DB.FILE_NAME))
    expect(newDb.equals(oldDbBytes)).toBe(true)
    expect(await exists(join(newPath, LEGACY_USER_DATA.DB_FILE_NAME))).toBe(false)
    expect(await exists(join(newPath, `${DB.FILE_NAME}-wal`))).toBe(true)

    // Everything else copied, including nested folders.
    expect(await fs.readFile(join(newPath, 'secrets.json'), 'utf8')).toContain('encryptedApiKey')
    expect(await fs.readFile(join(newPath, 'logs', 'app.log'), 'utf8')).toBe('log line\n')
    expect((await fs.stat(join(newPath, 'Cache', 'nested', 'blob.bin'))).size).toBe(32)

    // Marker written.
    const marker = JSON.parse(await fs.readFile(join(newPath, 'userdata-migrated.json'), 'utf8'))
    expect(marker).toMatchObject({ from: oldPath, fileCount: 6, renamedDatabase: true })

    // Old folder untouched (still has its own database under the old name).
    expect(
      (await fs.readFile(join(oldPath, LEGACY_USER_DATA.DB_FILE_NAME))).equals(oldDbBytes),
    ).toBe(true)
    expect(await exists(join(oldPath, DB.FILE_NAME))).toBe(false)
  })

  it('is idempotent — a second run does nothing', async () => {
    const newPath = join(root, 'Tagrove')
    await migrateLegacyUserData({ oldPath, newPath })
    const second = await migrateLegacyUserData({ oldPath, newPath })
    expect(second).toMatchObject({ performed: false, reason: 'already-migrated' })
  })

  it('skips when the new folder already contains real app data', async () => {
    const newPath = join(root, 'Tagrove')
    await fs.mkdir(newPath, { recursive: true })
    await fs.writeFile(join(newPath, DB.FILE_NAME), Buffer.alloc(4, 9))

    const result = await migrateLegacyUserData({ oldPath, newPath })

    expect(result).toMatchObject({ performed: false, reason: 'new-folder-in-use' })
    // Nothing was copied over the existing data.
    expect((await fs.stat(join(newPath, DB.FILE_NAME))).size).toBe(4)
  })

  it('merges into an existing new folder that has no app data yet (e.g. lock file only)', async () => {
    const newPath = join(root, 'Tagrove')
    await fs.mkdir(newPath, { recursive: true })
    await fs.writeFile(join(newPath, 'lockfile'), 'x')

    const result = await migrateLegacyUserData({ oldPath, newPath })

    expect(result).toMatchObject({ performed: true, reason: 'migrated' })
    expect(await exists(join(newPath, 'lockfile'))).toBe(true)
    expect(await exists(join(newPath, DB.FILE_NAME))).toBe(true)
  })

  it('does not let a stray logs folder (e.g. from a test run) block the migration', async () => {
    const newPath = join(root, 'Tagrove')
    await fs.mkdir(join(newPath, 'logs'), { recursive: true })
    await fs.writeFile(join(newPath, 'logs', 'main.log'), 'noise')

    const result = await migrateLegacyUserData({ oldPath, newPath })

    expect(result).toMatchObject({ performed: true, reason: 'migrated' })
    expect(await exists(join(newPath, DB.FILE_NAME))).toBe(true)
    expect(await exists(join(newPath, 'logs', 'main.log'))).toBe(true)
  })

  it('reports an error and writes no marker when the copy is incomplete', async () => {
    const newPath = join(root, 'Tagrove')
    const partialCopy = async (src: string, dest: string): Promise<void> => {
      await fs.cp(src, dest, {
        recursive: true,
        force: true,
        filter: (source) => !source.endsWith('blob.bin'),
      })
    }

    const result = await migrateLegacyUserData({ oldPath, newPath, copyDir: partialCopy })

    expect(result.performed).toBe(false)
    expect(result.reason).toBe('error')
    expect(result.error).toContain('blob.bin')
    expect(await exists(join(newPath, 'userdata-migrated.json'))).toBe(false)
  })

  it('does nothing when there is no old folder (fresh install)', async () => {
    const result = await migrateLegacyUserData({
      oldPath: join(root, 'DoesNotExist'),
      newPath: join(root, 'Tagrove'),
    })
    expect(result).toMatchObject({ performed: false, reason: 'no-old-folder' })
    expect(await exists(join(root, 'Tagrove'))).toBe(false)
  })
})
