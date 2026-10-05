import type { Database as SqliteDatabase } from 'better-sqlite3'

/**
 * Numbered, forward-only migrations. Each migration runs once, inside a
 * transaction, guarded by PRAGMA user_version. Never edit an applied
 * migration — add a new one with the next number.
 */
export interface Migration {
  version: number
  name: string
  up: (db: SqliteDatabase) => void
}

export const MIGRATIONS: Array<Migration> = [
  {
    version: 1,
    name: 'initial-schema',
    up(db) {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ai_generated INTEGER NOT NULL DEFAULT 0,
          last_export_path TEXT
        );

        CREATE TABLE images (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          last_modified_ms INTEGER NOT NULL,
          file_hash TEXT,
          missing INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          UNIQUE(project_id, path)
        );
        CREATE INDEX idx_images_project ON images(project_id);
        CREATE INDEX idx_images_hash ON images(project_id, file_hash);

        CREATE TABLE metadata (
          image_id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT '',
          keywords TEXT NOT NULL DEFAULT '[]',
          category_id TEXT,
          edited INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          preset_id TEXT,
          status TEXT NOT NULL DEFAULT 'idle',
          error TEXT,
          generated_at INTEGER,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          extra_instructions TEXT NOT NULL DEFAULT '',
          keyword_min INTEGER,
          keyword_max INTEGER,
          tone TEXT NOT NULL DEFAULT '',
          always_include TEXT NOT NULL DEFAULT '[]',
          never_use TEXT NOT NULL DEFAULT '[]',
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    },
  },
]

export function runMigrations(db: SqliteDatabase, migrations: Array<Migration> = MIGRATIONS): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const migration of migrations) {
    if (migration.version <= current) continue
    db.exec('BEGIN')
    try {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
