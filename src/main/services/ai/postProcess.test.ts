import { describe, expect, it } from 'vitest'
import {
  cleanKeywords,
  cleanTitle,
  containsBannedWord,
  normalizeBannedWords,
  postProcessMetadata,
  resolveCategoryId,
  stripBannedWords,
} from './postProcess'

const CATEGORIES = [
  { id: '1', name: 'Animals' },
  { id: '7', name: 'Food' },
  { id: '11', name: 'Landscapes' },
]

const BANNED = ['nikon', 'canon']

describe('normalizeBannedWords', () => {
  it('trims, lowercases, dedupes, and drops empties', () => {
    expect(normalizeBannedWords([' Nikon ', 'nikon', '', 'CANON'])).toEqual(['nikon', 'canon'])
  })
})

describe('stripBannedWords / cleanTitle', () => {
  it('removes banned words with surrounding whitespace and collapses spaces', () => {
    expect(stripBannedWords('A Nikon camera on a table', ['nikon'])).toBe('A camera on a table')
    // A hyphenated leftover glues to the previous word; acceptable for title cleanup.
    expect(stripBannedWords('A Nikon camera on a Canon-free table', ['nikon', 'canon'])).toBe(
      'A camera on a-free table',
    )
  })

  it('cleans and truncates the title to 200 characters', () => {
    const title = `  A   NIKON shot of   ${'d'.repeat(300)}  `
    const cleaned = cleanTitle(title, BANNED)
    expect(cleaned.startsWith('A shot of')).toBe(true)
    expect(cleaned.length).toBeLessThanOrEqual(200)
    expect(cleaned).not.toContain('nikon')
  })

  it('trims trailing punctuation left over after stripping', () => {
    expect(cleanTitle('A rowboat on the lake, canon removed', ['canon'])).toBe(
      'A rowboat on the lake, removed',
    )
  })
})

describe('containsBannedWord / cleanKeywords', () => {
  it('matches whole words only', () => {
    expect(containsBannedWord('nikon lens', ['nikon'])).toBe(true)
    expect(containsBannedWord('canyon at dusk', ['nikon'])).toBe(false)
  })

  it('dedupes case-insensitively, keeps first spelling', () => {
    expect(cleanKeywords(['Sunset', 'sunset', 'SUNSET over sea', 'sky'], [])).toEqual([
      'Sunset',
      'SUNSET over sea',
      'sky',
    ])
  })

  it('drops keywords containing a banned word', () => {
    expect(cleanKeywords(['golden retriever', 'nikon lens', 'forest walk'], ['nikon'])).toEqual([
      'golden retriever',
      'forest walk',
    ])
  })

  it('trims, compacts whitespace, and drops empties', () => {
    expect(cleanKeywords(['  lake   view  ', '   ', 'river'], [])).toEqual(['lake view', 'river'])
  })

  it('caps the list at 49 keywords', () => {
    const keywords = Array.from({ length: 60 }, (_, index) => `keyword${index + 1}`)
    expect(cleanKeywords(keywords, [])).toHaveLength(49)
  })

  it('truncates very long keywords to 64 characters', () => {
    const cleaned = cleanKeywords(['x'.repeat(80)], [])
    expect(cleaned[0]?.length).toBe(64)
  })
})

describe('resolveCategoryId', () => {
  it('matches by id, then by case-insensitive name, else null', () => {
    expect(resolveCategoryId('7', CATEGORIES)).toBe('7')
    expect(resolveCategoryId('food', CATEGORIES)).toBe('7')
    expect(resolveCategoryId('  LANDSCAPES ', CATEGORIES)).toBe('11')
    expect(resolveCategoryId('99', CATEGORIES)).toBe(null)
    expect(resolveCategoryId('   ', CATEGORIES)).toBe(null)
  })
})

describe('postProcessMetadata', () => {
  it('runs the full pipeline', () => {
    const result = postProcessMetadata(
      {
        title: '  A serene   NIKON landscape at dawn  ',
        keywords: ['mountains', 'Mountains', 'canon lens', 'fog', ''],
        category: 'Landscapes',
      },
      { categories: CATEGORIES, bannedWords: BANNED },
    )
    expect(result.title).toBe('A serene landscape at dawn')
    expect(result.keywords).toEqual(['mountains', 'fog'])
    expect(result.categoryId).toBe('11')
  })

  it('returns a null category when the model invents one', () => {
    const result = postProcessMetadata(
      { title: 'A quiet harbor', keywords: ['boats'], category: 'Underwater cities' },
      { categories: CATEGORIES, bannedWords: BANNED },
    )
    expect(result.categoryId).toBe(null)
  })
})
