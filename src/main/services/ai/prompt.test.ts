import { describe, expect, it } from 'vitest'
import type { Category, Preset } from '@shared/types'
import { buildMetadataPrompt } from './prompt'
import { postProcessMetadata } from './postProcess'

const CATEGORIES: Array<Category> = [
  { id: '1', name: 'Animals' },
  { id: '7', name: 'Food' },
]

const PRESET: Preset = {
  id: 'preset-1',
  name: 'Photo',
  extraInstructions: 'Emphasize natural light.',
  keywordMin: 35,
  keywordMax: 45,
  tone: 'warm and cinematic',
  alwaysInclude: ['golden hour', 'nature'],
  neverUse: ['flat light'],
  isBuiltin: true,
}

describe('buildMetadataPrompt with presets', () => {
  it('uses the default keyword range without a preset', () => {
    const prompt = buildMetadataPrompt(CATEGORIES)
    expect(prompt).toContain('30 to 49 keywords')
    expect(prompt).not.toContain('Additional instructions')
  })

  it('injects the preset range, tone, and extra instructions', () => {
    const prompt = buildMetadataPrompt(CATEGORIES, PRESET)
    expect(prompt).toContain('35 to 45 keywords')
    expect(prompt).toContain('Emphasize natural light.')
    expect(prompt).toContain('warm and cinematic tone')
    expect(prompt).toContain('preset "Photo"')
    expect(prompt).toContain('- 7: Food')
  })
})

describe('postProcessMetadata with presets', () => {
  it('extends the banned list with the preset never-use words', () => {
    const result = postProcessMetadata(
      {
        title: 'A calm scene in flat light',
        keywords: ['beach', 'flat light', 'waves'],
        category: '1',
      },
      { categories: CATEGORIES, bannedWords: [], preset: PRESET },
    )
    // 'flat light' is dropped by the preset never-use list; the always-include
    // keywords are prepended by the normal pipeline.
    expect(result.title).toBe('A calm scene in')
    expect(result.keywords).toEqual(['golden hour', 'nature', 'beach', 'waves'])
  })

  it('extends the banned list without touching keywords when the preset has no lists', () => {
    const preset: Preset = { ...PRESET, alwaysInclude: [], neverUse: ['flat light'] }
    const result = postProcessMetadata(
      {
        title: 'A calm scene',
        keywords: ['beach', 'flat light', 'waves'],
        category: '1',
      },
      { categories: CATEGORIES, bannedWords: [], preset },
    )
    expect(result.keywords).toEqual(['beach', 'waves'])
  })

  it('prepends always-include keywords and caps at the preset max', () => {
    const result = postProcessMetadata(
      {
        title: 'A calm scene',
        keywords: Array.from({ length: 60 }, (_, index) => `kw${index + 1}`),
        category: '1',
      },
      { categories: CATEGORIES, bannedWords: [], preset: PRESET },
    )
    expect(result.keywords[0]).toBe('golden hour')
    expect(result.keywords[1]).toBe('nature')
    expect(result.keywords).toHaveLength(45)
  })

  it('does not duplicate always-include keywords the model already produced', () => {
    const result = postProcessMetadata(
      {
        title: 'A calm scene',
        keywords: ['Nature', 'forest'],
        category: '1',
      },
      { categories: CATEGORIES, bannedWords: [], preset: PRESET },
    )
    const lowers = result.keywords.map((keyword) => keyword.toLowerCase())
    expect(lowers.filter((keyword) => keyword === 'nature')).toHaveLength(1)
  })

  it('works without a preset', () => {
    const result = postProcessMetadata(
      { title: 'A calm scene', keywords: ['beach'], category: 'Animals' },
      { categories: CATEGORIES, bannedWords: [] },
    )
    expect(result.keywords).toEqual(['beach'])
    expect(result.categoryId).toBe('1')
  })
})
