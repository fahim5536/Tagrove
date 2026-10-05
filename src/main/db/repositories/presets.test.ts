import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../migrations'
import {
  DEFAULT_PRESETS,
  deletePreset,
  getPreset,
  listPresets,
  savePreset,
  seedPresets,
} from './presets'

function newDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

describe('presets repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = newDb()
  })

  it('seeds the four built-in presets exactly once', () => {
    expect(seedPresets(db)).toBe(4)
    expect(DEFAULT_PRESETS).toHaveLength(4)
    expect(seedPresets(db)).toBe(0)
    const presets = listPresets(db)
    expect(presets).toHaveLength(4)
    expect(presets.every((preset) => preset.isBuiltin)).toBe(true)
    expect(presets.map((preset) => preset.name)).toEqual([
      'Business concept',
      'Isolated on white',
      'Photo',
      'Vector / Illustration',
    ])
  })

  it('creates and updates presets, keeping builtin status on update', () => {
    seedPresets(db)
    const created = savePreset(db, {
      name: 'Minimal',
      extraInstructions: 'Keep titles very short.',
      keywordMin: 25,
      keywordMax: 30,
      tone: 'minimal',
      alwaysInclude: ['minimal'],
      neverUse: ['busy'],
    })
    expect(created.isBuiltin).toBe(false)
    expect(created.keywordMin).toBe(25)

    const updated = savePreset(db, { ...created, name: 'Minimal renamed', keywordMin: 20 })
    expect(updated.name).toBe('Minimal renamed')
    expect(updated.keywordMin).toBe(20)
    expect(updated.isBuiltin).toBe(false)

    const photo = listPresets(db).find((preset) => preset.name === 'Photo')
    if (!photo) throw new Error('Photo preset missing')
    const editedBuiltin = savePreset(db, { ...photo, tone: 'poetic' })
    expect(editedBuiltin.isBuiltin).toBe(true)
  })

  it('deletes presets and returns null for unknown ids', () => {
    seedPresets(db)
    const created = savePreset(db, {
      name: 'Temp',
      extraInstructions: '',
      keywordMin: null,
      keywordMax: null,
      tone: '',
      alwaysInclude: [],
      neverUse: [],
    })
    expect(deletePreset(db, created.id)).toBe(true)
    expect(getPreset(db, created.id)).toBe(null)
    expect(deletePreset(db, 'does-not-exist')).toBe(false)
  })
})
