import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, runMigrations } from './migrations'

function newDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return db
}

describe('runMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = newDb()
  })

  it('applies all migrations to a fresh database', () => {
    runMigrations(db)
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version)
  })

  it('creates the expected tables', () => {
    runMigrations(db)
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
    expect(tables).toEqual(
      expect.arrayContaining(['projects', 'images', 'metadata', 'presets', 'settings']),
    )
  })

  it('is idempotent — running twice does not re-apply or fail', () => {
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    const projectsCount = (
      db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'projects'").get() as {
        c: number
      }
    ).c
    expect(projectsCount).toBe(1)
  })

  it('rolls back a failing migration instead of leaving a partial schema', () => {
    const broken = [
      ...MIGRATIONS,
      {
        version: 99,
        name: 'broken',
        up(database: Database.Database) {
          database.exec('CREATE TABLE temp_ok (a)')
          database.exec('CREATE TABLE with (definitely broken sql')
        },
      },
    ]
    expect(() => runMigrations(db, broken)).toThrow()
    // Migration 1 committed fine; the broken one rolled back with no temp_ok table.
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'temp_ok'")
        .all() as Array<unknown>
    ).length
    expect(tables).toBe(0)
  })
})
