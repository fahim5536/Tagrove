import Database from 'better-sqlite3'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS } from '../../db/migrations'
import { backupBeforeMigration } from './index'

let root: string
let dbFile: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tagrove-backup-'))
  dbFile = join(root, 'tagrove.db')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('backupBeforeMigration', () => {
  it('creates a backup when migrations are pending on an existing file', async () => {
    const db = new Database(dbFile)
    db.pragma('user_version = 0') // simulate an old database awaiting migration

    const backupPath = await backupBeforeMigration(db, dbFile)

    expect(backupPath).not.toBe(null)
    expect(backupPath).toContain('pre-migration-v0')
    expect(existsSync(backupPath as string)).toBe(true)
    const files = await readdir(join(root, 'backups'))
    expect(files).toHaveLength(1)
    db.close()
  })

  it('skips when no migrations are pending', async () => {
    const db = new Database(dbFile)
    const latest = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0
    db.pragma(`user_version = ${latest}`)

    const backupPath = await backupBeforeMigration(db, dbFile)

    expect(backupPath).toBe(null)
    expect(existsSync(join(root, 'backups'))).toBe(false)
    db.close()
  })

  it('skips in-memory databases and missing files', async () => {
    const memory = new Database(':memory:')
    memory.pragma('user_version = 0')
    expect(await backupBeforeMigration(memory, ':memory:')).toBe(null)

    const ghostPath = join(root, 'ghost.db')
    const ghost = new Database(ghostPath)
    ghost.pragma('user_version = 0')
    ghost.close()
    await rm(ghostPath, { force: true })
    expect(await backupBeforeMigration(ghost, ghostPath)).toBe(null)
  })

  it('prunes old backups, keeping only the newest few', async () => {
    const db = new Database(dbFile)
    db.pragma('user_version = 0')

    // Simulate three existing backups beyond the keep count of 5.
    const backupsDir = join(root, 'backups')
    await mkdir(backupsDir, { recursive: true })
    for (const name of [
      'tagrove-pre-migration-v0-a.db',
      'tagrove-pre-migration-v0-b.db',
      'tagrove-pre-migration-v0-c.db',
    ]) {
      await writeFile(join(backupsDir, name), 'x')
    }

    await backupBeforeMigration(db, dbFile)

    const files = (await readdir(backupsDir)).filter((name) => name.endsWith('.db')).sort()
    // 3 simulated + 1 new = 4, under the keep count of 5.
    expect(files).toHaveLength(4)

    // Push past the limit: three more simulated backups, then re-run.
    for (const name of [
      'tagrove-pre-migration-v0-d.db',
      'tagrove-pre-migration-v0-e.db',
      'tagrove-pre-migration-v0-f.db',
    ]) {
      await writeFile(join(backupsDir, name), 'x')
    }
    await backupBeforeMigration(db, dbFile)
    const after = (await readdir(backupsDir)).filter((name) => name.endsWith('.db')).sort()
    expect(after.length).toBeLessThanOrEqual(5)
    db.close()
  })
})
