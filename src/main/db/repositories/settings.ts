import type { Database as SqliteDatabase } from 'better-sqlite3'

/**
 * Key-value settings stored in SQLite. Values are JSON-encoded so any
 * JSON-serializable setting works without schema changes.
 */

export function getSetting(db: SqliteDatabase, key: string): unknown {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as unknown
  } catch {
    return undefined
  }
}

export function setSetting(db: SqliteDatabase, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value))
}

export function getAllSettings(db: SqliteDatabase): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value) as unknown
    } catch {
      // Corrupt entry — ignore and let the default apply.
    }
  }
  return out
}
