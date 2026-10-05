import type { Database as SqliteDatabase } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Preset } from '@shared/types'

/**
 * Preset persistence plus the four built-in presets seeded into an empty
 * database. Presets tune the AI prompt (extra instructions, keyword range,
 * tone) and post-processing (always-include / never-use keyword lists).
 */

interface PresetRow {
  id: string
  name: string
  extra_instructions: string
  keyword_min: number | null
  keyword_max: number | null
  tone: string
  always_include: string
  never_use: string
  is_builtin: number
  created_at: number
  updated_at: number
}

function toPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    extraInstructions: row.extra_instructions,
    keywordMin: row.keyword_min,
    keywordMax: row.keyword_max,
    tone: row.tone,
    alwaysInclude: JSON.parse(row.always_include) as Array<string>,
    neverUse: JSON.parse(row.never_use) as Array<string>,
    isBuiltin: row.is_builtin === 1,
  }
}

export const DEFAULT_PRESETS: Array<Omit<Preset, 'id' | 'isBuiltin'>> = [
  {
    name: 'Photo',
    extraInstructions:
      'This is a photograph. Describe the scene naturally: subject, setting, lighting, mood, and photographic style.',
    keywordMin: 32,
    keywordMax: 49,
    tone: 'natural and descriptive',
    alwaysInclude: [],
    neverUse: ['illustration', 'vector', '3d render'],
  },
  {
    name: 'Vector / Illustration',
    extraInstructions:
      'This is a vector illustration or digital artwork. Describe the art style, composition, and subject; mention flat design or line art where it applies. Do not describe camera optics.',
    keywordMin: 30,
    keywordMax: 45,
    tone: 'clear and graphic-design oriented',
    alwaysInclude: ['illustration'],
    neverUse: ['photograph', 'photo'],
  },
  {
    name: 'Isolated on white',
    extraInstructions:
      'The subject is isolated on a plain white background (product or object shot). Describe the object, its shape, material, and color precisely, and mention the isolated white background.',
    keywordMin: 30,
    keywordMax: 45,
    tone: 'precise and product-focused',
    alwaysInclude: ['isolated', 'white background'],
    neverUse: ['landscape', 'crowd'],
  },
  {
    name: 'Business concept',
    extraInstructions:
      'This image represents a business or workplace concept. Emphasize the idea it communicates (teamwork, growth, finance, strategy) alongside the visual content, so buyers find it for editorial and corporate searches.',
    keywordMin: 35,
    keywordMax: 49,
    tone: 'professional and conceptual',
    alwaysInclude: ['business'],
    neverUse: [],
  },
]

export function listPresets(db: SqliteDatabase): Array<Preset> {
  const rows = db
    .prepare('SELECT * FROM presets ORDER BY is_builtin DESC, name')
    .all() as Array<PresetRow>
  return rows.map(toPreset)
}

export function getPreset(db: SqliteDatabase, id: string): Preset | null {
  const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow | undefined
  return row ? toPreset(row) : null
}

export function savePreset(
  db: SqliteDatabase,
  request: Omit<Preset, 'isBuiltin' | 'id'> & { id?: string; isBuiltin?: boolean },
): Preset {
  const now = Date.now()
  const id = request.id ?? randomUUID()
  const existing = db.prepare('SELECT id, is_builtin FROM presets WHERE id = ?').get(id) as
    { id: string; is_builtin: number } | undefined
  db.prepare(
    `INSERT INTO presets (id, name, extra_instructions, keyword_min, keyword_max, tone, always_include, never_use, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       extra_instructions = excluded.extra_instructions,
       keyword_min = excluded.keyword_min,
       keyword_max = excluded.keyword_max,
       tone = excluded.tone,
       always_include = excluded.always_include,
       never_use = excluded.never_use,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    request.name.trim(),
    request.extraInstructions,
    request.keywordMin,
    request.keywordMax,
    request.tone,
    JSON.stringify(request.alwaysInclude),
    JSON.stringify(request.neverUse),
    existing ? existing.is_builtin : 0,
    now,
    now,
  )
  const saved = getPreset(db, id)
  if (!saved) throw new Error('Preset save failed')
  return saved
}

export function deletePreset(db: SqliteDatabase, id: string): boolean {
  const result = db.prepare('DELETE FROM presets WHERE id = ?').run(id)
  return result.changes > 0
}

/** Seeds the four built-in presets into an empty table (first launch only). */
export function seedPresets(db: SqliteDatabase): number {
  const count = db.prepare('SELECT COUNT(*) AS c FROM presets').get() as { c: number }
  if (count.c > 0) return 0
  const now = Date.now()
  const insert = db.prepare(
    `INSERT INTO presets (id, name, extra_instructions, keyword_min, keyword_max, tone, always_include, never_use, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  const run = db.transaction(() => {
    for (const preset of DEFAULT_PRESETS) {
      insert.run(
        randomUUID(),
        preset.name,
        preset.extraInstructions,
        preset.keywordMin,
        preset.keywordMax,
        preset.tone,
        JSON.stringify(preset.alwaysInclude),
        JSON.stringify(preset.neverUse),
        now,
        now,
      )
    }
  })
  run()
  return DEFAULT_PRESETS.length
}
