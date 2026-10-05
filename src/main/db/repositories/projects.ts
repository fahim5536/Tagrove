import type { Database as SqliteDatabase } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { GenerationItemStatus, ProjectDetail, ProjectSummary } from '@shared/types'
import { getSetting, setSetting } from './settings'

/**
 * Project/image/metadata persistence. All functions take the database handle
 * so they can be tested against an in-memory database.
 */

interface ProjectRow {
  id: string
  name: string
  created_at: number
  updated_at: number
  ai_generated: number
  last_export_path: string | null
}

interface ImageRow {
  id: string
  project_id: string
  path: string
  file_name: string
  size_bytes: number
  last_modified_ms: number
  file_hash: string | null
  missing: number
  sort_order: number
  created_at: number
}

interface MetadataRow {
  image_id: string
  title: string
  keywords: string
  category_id: string | null
  edited: number
  model: string | null
  preset_id: string | null
  status: string
  error: string | null
  generated_at: number | null
  updated_at: number
}

function toSummary(
  row: ProjectRow,
  imageCount: number,
  doneCount: number,
  failedCount: number,
): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiGenerated: row.ai_generated === 1,
    imageCount,
    doneCount,
    failedCount,
    lastExportPath: row.last_export_path,
  }
}

function toImage(row: ImageRow, meta: MetadataRow | undefined): ProjectDetail['images'][number] {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    lastModifiedMs: row.last_modified_ms,
    missing: row.missing === 1,
    sortOrder: row.sort_order,
    fileHash: row.file_hash,
    title: meta?.title ?? '',
    keywords: meta ? (JSON.parse(meta.keywords) as Array<string>) : [],
    categoryId: meta?.category_id ?? null,
    edited: meta?.edited === 1,
    model: meta?.model ?? null,
    presetId: meta?.preset_id ?? null,
    status: (meta?.status as GenerationItemStatus | undefined) ?? 'idle',
    error: meta?.error ?? null,
    generatedAt: meta?.generated_at ?? null,
  }
}

export function listProjects(db: SqliteDatabase): Array<ProjectSummary> {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id) AS image_count,
        (SELECT COUNT(*) FROM images i JOIN metadata m ON m.image_id = i.id
          WHERE i.project_id = p.id AND m.status = 'done') AS done_count,
        (SELECT COUNT(*) FROM images i JOIN metadata m ON m.image_id = i.id
          WHERE i.project_id = p.id AND m.status = 'failed') AS failed_count
      FROM projects p ORDER BY p.updated_at DESC`,
    )
    .all() as Array<ProjectRow & { image_count: number; done_count: number; failed_count: number }>
  return rows.map((row) => toSummary(row, row.image_count, row.done_count, row.failed_count))
}

export function createProject(db: SqliteDatabase, options: { name?: string } = {}): ProjectSummary {
  const now = Date.now()
  const id = randomUUID()
  const name = options.name?.trim() || 'Untitled project'
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    now,
    now,
  )
  return getProjectSummary(db, id)
}

export function getProjectSummary(db: SqliteDatabase, id: string): ProjectSummary {
  const row = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id) AS image_count,
        (SELECT COUNT(*) FROM images i JOIN metadata m ON m.image_id = i.id
          WHERE i.project_id = p.id AND m.status = 'done') AS done_count,
        (SELECT COUNT(*) FROM images i JOIN metadata m ON m.image_id = i.id
          WHERE i.project_id = p.id AND m.status = 'failed') AS failed_count
      FROM projects p WHERE p.id = ?`,
    )
    .get(id) as
    (ProjectRow & { image_count: number; done_count: number; failed_count: number }) | undefined
  if (!row) throw new Error(`Project ${id} not found`)
  return toSummary(row, row.image_count, row.done_count, row.failed_count)
}

export function getProjectDetail(db: SqliteDatabase, id: string): ProjectDetail | null {
  const summaryRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    ProjectRow | undefined
  if (!summaryRow) return null
  const imageRows = db
    .prepare('SELECT * FROM images WHERE project_id = ? ORDER BY sort_order, created_at')
    .all(id) as Array<ImageRow>
  const metadataStmt = db.prepare('SELECT * FROM metadata WHERE image_id = ?')
  const images = imageRows.map((row) =>
    toImage(row, metadataStmt.get(row.id) as MetadataRow | undefined),
  )
  const counts = { image_count: images.length, done_count: 0, failed_count: 0 }
  for (const image of images) {
    if (image.status === 'done') counts.done_count += 1
    if (image.status === 'failed') counts.failed_count += 1
  }
  return {
    project: toSummary(summaryRow, counts.image_count, counts.done_count, counts.failed_count),
    images,
  }
}

export function touchProject(db: SqliteDatabase, id: string): void {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function renameProject(db: SqliteDatabase, id: string, name: string): ProjectSummary {
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(
    name.trim(),
    Date.now(),
    id,
  )
  return getProjectSummary(db, id)
}

export function setProjectAiGenerated(
  db: SqliteDatabase,
  id: string,
  aiGenerated: boolean,
): ProjectSummary {
  db.prepare('UPDATE projects SET ai_generated = ?, updated_at = ? WHERE id = ?').run(
    aiGenerated ? 1 : 0,
    Date.now(),
    id,
  )
  return getProjectSummary(db, id)
}

export function setProjectLastExportPath(db: SqliteDatabase, id: string, filePath: string): void {
  db.prepare('UPDATE projects SET last_export_path = ?, updated_at = ? WHERE id = ?').run(
    filePath,
    Date.now(),
    id,
  )
}

export function deleteProject(db: SqliteDatabase, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function duplicateProject(db: SqliteDatabase, id: string): ProjectSummary {
  const source = getProjectDetail(db, id)
  if (!source) throw new Error(`Project ${id} not found`)
  const now = Date.now()
  const newId = randomUUID()
  const copy = db.transaction(() => {
    db.prepare(
      'INSERT INTO projects (id, name, created_at, updated_at, ai_generated) VALUES (?, ?, ?, ?, ?)',
    ).run(newId, `${source.project.name} (copy)`, now, now, source.project.aiGenerated ? 1 : 0)
    const insertImage = db.prepare(
      `INSERT INTO images (id, project_id, path, file_name, size_bytes, last_modified_ms, file_hash, missing, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertMetadata = db.prepare(
      `INSERT INTO metadata (image_id, title, keywords, category_id, edited, model, preset_id, status, error, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    source.images.forEach((image, index) => {
      const imageId = randomUUID()
      insertImage.run(
        imageId,
        newId,
        image.path,
        image.fileName,
        image.sizeBytes,
        image.lastModifiedMs,
        image.fileHash,
        image.missing ? 1 : 0,
        index,
        now,
      )
      insertMetadata.run(
        imageId,
        image.title,
        JSON.stringify(image.keywords),
        image.categoryId,
        image.edited ? 1 : 0,
        image.model,
        image.presetId,
        image.status,
        image.error,
        image.generatedAt,
        now,
      )
    })
  })
  copy()
  return getProjectSummary(db, newId)
}

export interface NewImageInput {
  path: string
  fileName: string
  sizeBytes: number
  lastModifiedMs: number
  fileHash: string | null
}

export function insertImages(
  db: SqliteDatabase,
  projectId: string,
  items: Array<NewImageInput>,
): Array<ProjectDetail['images'][number]> {
  const now = Date.now()
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM images WHERE project_id = ?')
    .get(projectId) as { max_order: number }
  let sortOrder = maxRow.max_order + 1
  const insertImage = db.prepare(
    `INSERT OR IGNORE INTO images (id, project_id, path, file_name, size_bytes, last_modified_ms, file_hash, missing, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
  const insertMetadata = db.prepare(
    `INSERT OR IGNORE INTO metadata (image_id, title, keywords, category_id, edited, status, updated_at)
     VALUES (?, '', '[]', NULL, 0, 'idle', ?)`,
  )
  const inserted: Array<ProjectDetail['images'][number]> = []
  const run = db.transaction(() => {
    for (const item of items) {
      const imageId = randomUUID()
      const result = insertImage.run(
        imageId,
        projectId,
        item.path,
        item.fileName,
        item.sizeBytes,
        item.lastModifiedMs,
        item.fileHash,
        sortOrder,
        now,
      )
      if (result.changes === 0) continue // path already in project
      sortOrder += 1
      insertMetadata.run(imageId, now)
      inserted.push({
        id: imageId,
        projectId,
        path: item.path,
        fileName: item.fileName,
        sizeBytes: item.sizeBytes,
        lastModifiedMs: item.lastModifiedMs,
        missing: false,
        sortOrder: sortOrder - 1,
        fileHash: item.fileHash,
        title: '',
        keywords: [],
        categoryId: null,
        edited: false,
        model: null,
        presetId: null,
        status: 'idle',
        error: null,
        generatedAt: null,
      })
    }
    touchProject(db, projectId)
  })
  run()
  return inserted
}

export interface MetadataPatch {
  title: string
  keywords: Array<string>
  categoryId: string | null
}

/** Persists a user edit: marks the row edited and touches the project. */
export function saveMetadataEdit(db: SqliteDatabase, imageId: string, patch: MetadataPatch): void {
  const now = Date.now()
  const run = db.transaction(() => {
    const image = db.prepare('SELECT project_id FROM images WHERE id = ?').get(imageId) as
      { project_id: string } | undefined
    if (!image) throw new Error(`Image ${imageId} not found`)
    db.prepare(
      `UPDATE metadata
       SET title = ?, keywords = ?, category_id = ?, edited = 1, updated_at = ?
       WHERE image_id = ?`,
    ).run(patch.title, JSON.stringify(patch.keywords), patch.categoryId, now, imageId)
    touchProject(db, image.project_id)
  })
  run()
}

export function saveGenerationResult(
  db: SqliteDatabase,
  imageId: string,
  result: {
    title: string
    keywords: Array<string>
    categoryId: string | null
    model: string | null
    presetId: string | null
  },
): void {
  db.prepare(
    `UPDATE metadata
     SET title = ?, keywords = ?, category_id = ?, model = ?, preset_id = ?,
         status = 'done', error = NULL, edited = 0, generated_at = ?, updated_at = ?
     WHERE image_id = ?`,
  ).run(
    result.title,
    JSON.stringify(result.keywords),
    result.categoryId,
    result.model,
    result.presetId,
    Date.now(),
    Date.now(),
    imageId,
  )
}

export function setImageStatus(
  db: SqliteDatabase,
  imageId: string,
  status: GenerationItemStatus,
  error: string | null,
): void {
  db.prepare('UPDATE metadata SET status = ?, error = ?, updated_at = ? WHERE image_id = ?').run(
    status,
    error,
    Date.now(),
    imageId,
  )
}

export function setImageMissing(db: SqliteDatabase, imageId: string, missing: boolean): void {
  db.prepare('UPDATE images SET missing = ? WHERE id = ?').run(missing ? 1 : 0, imageId)
}

export function getImageProjectId(db: SqliteDatabase, imageId: string): string | null {
  const row = db.prepare('SELECT project_id FROM images WHERE id = ?').get(imageId) as
    { project_id: string } | undefined
  return row?.project_id ?? null
}

export function relinkImage(
  db: SqliteDatabase,
  imageId: string,
  newPath: string,
  fileHash: string | null,
): void {
  db.prepare('UPDATE images SET path = ?, file_hash = ?, missing = 0 WHERE id = ?').run(
    newPath,
    fileHash,
    imageId,
  )
}

/** Hashes already present in the project — used to warn about duplicate imports. */
export function findExistingHashes(
  db: SqliteDatabase,
  projectId: string,
  hashes: Array<string>,
): Set<string> {
  const found = new Set<string>()
  const stmt = db.prepare('SELECT file_hash FROM images WHERE project_id = ? AND file_hash = ?')
  for (const hash of hashes) {
    if (stmt.get(projectId, hash)) found.add(hash)
  }
  return found
}

// ---------------------------------------------------------------------------
// Active project (session recovery): the id lives in the settings table
// ---------------------------------------------------------------------------

export function getActiveProjectId(db: SqliteDatabase): string | null {
  const value = getSetting(db, 'activeProjectId')
  return typeof value === 'string' ? value : null
}

export function setActiveProjectId(db: SqliteDatabase, id: string): void {
  setSetting(db, 'activeProjectId', id)
}

/**
 * Returns the active project, creating a fresh one (and storing it) when the
 * id is missing or points at a deleted project. Called at startup, so a
 * crashed or restarted session always lands in a project.
 */
export function ensureActiveProject(db: SqliteDatabase): ProjectSummary {
  const activeId = getActiveProjectId(db)
  if (activeId) {
    try {
      return getProjectSummary(db, activeId)
    } catch {
      // Fall through and create a fresh project.
    }
  }
  const created = createProject(db)
  setActiveProjectId(db, created.id)
  return created
}
