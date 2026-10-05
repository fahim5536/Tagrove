import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../migrations'
import {
  createProject,
  deleteProject,
  duplicateProject,
  findExistingHashes,
  getProjectDetail,
  getProjectSummary,
  insertImages,
  listProjects,
  relinkImage,
  renameProject,
  saveGenerationResult,
  saveMetadataEdit,
  setImageMissing,
  setImageStatus,
} from './projects'
import type { NewImageInput } from './projects'

function newDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function imageInput(path: string, fileHash: string | null = null): NewImageInput {
  return {
    path,
    fileName: path.split('/').pop() ?? path,
    sizeBytes: 1234,
    lastModifiedMs: 1,
    fileHash,
  }
}

describe('projects repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = newDb()
  })

  it('creates projects with a default name and lists them newest-first', () => {
    const first = createProject(db, { name: 'Beach shoot' })
    const second = createProject(db)
    expect(first.name).toBe('Beach shoot')
    expect(second.name).toBe('Untitled project')
    const all = listProjects(db)
    expect(all).toHaveLength(2)
    expect(all[0]?.id).toBe(second.id)
  })

  it('inserts images and ignores paths that already exist in the project', () => {
    const project = createProject(db)
    const [first] = insertImages(db, project.id, [imageInput('/imgs/a.jpg', 'hash-a')])
    const secondBatch = insertImages(db, project.id, [
      imageInput('/imgs/a.jpg'),
      imageInput('/imgs/b.jpg'),
    ])
    expect(first?.path).toBe('/imgs/a.jpg')
    expect(secondBatch.map((image) => image.path)).toEqual(['/imgs/b.jpg'])
    expect(getProjectSummary(db, project.id).imageCount).toBe(2)
  })

  it('saves user edits and marks rows as edited', () => {
    const project = createProject(db)
    const [image] = insertImages(db, project.id, [imageInput('/a.jpg')])
    if (!image) throw new Error('image missing')
    saveMetadataEdit(db, image.id, {
      title: 'Edited title',
      keywords: ['a', 'b'],
      categoryId: '11',
    })
    const detail = getProjectDetail(db, project.id)
    expect(detail?.images[0]).toMatchObject({
      title: 'Edited title',
      keywords: ['a', 'b'],
      categoryId: '11',
      edited: true,
    })
  })

  it('persists generation results and reflects status counts in the summary', () => {
    const project = createProject(db)
    const images = insertImages(db, project.id, [imageInput('/a.jpg'), imageInput('/b.jpg')])
    const a = images[0]
    const b = images[1]
    if (!a || !b) throw new Error('images missing')
    saveGenerationResult(db, a.id, {
      title: 'Generated',
      keywords: ['k1'],
      categoryId: '7',
      model: 'gemini-2.5-flash',
      presetId: 'preset-1',
    })
    setImageStatus(db, b.id, 'failed', 'Network error.')
    const summary = getProjectSummary(db, project.id)
    expect(summary.doneCount).toBe(1)
    expect(summary.failedCount).toBe(1)
    const detail = getProjectDetail(db, project.id)
    expect(detail?.images[0]).toMatchObject({
      status: 'done',
      edited: false,
      model: 'gemini-2.5-flash',
      presetId: 'preset-1',
      categoryId: '7',
    })
    expect(detail?.images[1]).toMatchObject({ status: 'failed', error: 'Network error.' })
  })

  it('duplicates a project with its images and metadata', () => {
    const project = createProject(db, { name: 'Original' })
    const [image] = insertImages(db, project.id, [imageInput('/a.jpg', 'hash-1')])
    if (!image) throw new Error('image missing')
    saveMetadataEdit(db, image.id, { title: 'T', keywords: ['k'], categoryId: null })
    const copy = duplicateProject(db, project.id)
    expect(copy.name).toBe('Original (copy)')
    expect(copy.imageCount).toBe(1)
    const copyDetail = getProjectDetail(db, copy.id)
    expect(copyDetail?.images[0]).toMatchObject({ title: 'T', keywords: ['k'], fileHash: 'hash-1' })
    expect(copyDetail?.images[0]?.id).not.toBe(image.id)
  })

  it('deletes a project and cascades to images and metadata', () => {
    const project = createProject(db)
    insertImages(db, project.id, [imageInput('/a.jpg')])
    deleteProject(db, project.id)
    expect(getProjectDetail(db, project.id)).toBe(null)
    const orphans = (db.prepare('SELECT COUNT(*) AS c FROM metadata').get() as { c: number }).c
    expect(orphans).toBe(0)
  })

  it('tracks missing files and relinking', () => {
    const project = createProject(db)
    const [image] = insertImages(db, project.id, [imageInput('/old/a.jpg')])
    if (!image) throw new Error('image missing')
    setImageMissing(db, image.id, true)
    expect(getProjectDetail(db, project.id)?.images[0]?.missing).toBe(true)
    relinkImage(db, image.id, '/new/b.png', 'hash-new')
    const relinked = getProjectDetail(db, project.id)?.images[0]
    expect(relinked).toMatchObject({ path: '/new/b.png', missing: false, fileHash: 'hash-new' })
  })

  it('finds hashes that already exist in the project', () => {
    const project = createProject(db)
    insertImages(db, project.id, [imageInput('/a.jpg', 'hash-1')])
    const existing = findExistingHashes(db, project.id, ['hash-1', 'hash-2'])
    expect(existing.has('hash-1')).toBe(true)
    expect(existing.has('hash-2')).toBe(false)
  })

  it('renames a project and updates its timestamp', () => {
    const project = createProject(db, { name: 'Old' })
    const before = getProjectSummary(db, project.id).updatedAt
    const result = renameProject(db, project.id, 'New name')
    expect(result.name).toBe('New name')
    expect(result.updatedAt).toBeGreaterThanOrEqual(before)
  })
})
