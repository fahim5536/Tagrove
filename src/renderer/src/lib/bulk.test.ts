import { describe, expect, it } from 'vitest'
import { addKeywordToAll, countTitleMatches, removeKeywordFromAll, replaceInTitles } from './bulk'
import type { ImageRow } from '../store/generation.store'

function row(id: string, title: string, keywords: Array<string>): ImageRow {
  return {
    id,
    projectId: 'p1',
    path: `/imgs/${id}.jpg`,
    fileName: `${id}.jpg`,
    sizeBytes: 1,
    lastModifiedMs: 1,
    missing: false,
    title,
    keywords,
    categoryId: null,
    edited: false,
    status: 'done',
    error: null,
  }
}

describe('addKeywordToAll', () => {
  it('appends the keyword only to selected rows', () => {
    const rows = [row('a', 'A', ['lake']), row('b', 'B', ['lake'])]
    const result = addKeywordToAll(rows, ['a'], 'Sunset')
    expect(result[0]?.keywords).toEqual(['lake', 'Sunset'])
    expect(result[1]?.keywords).toEqual(['lake'])
  })

  it('skips empty keywords and case-insensitive duplicates', () => {
    const rows = [row('a', 'A', ['Lake'])]
    expect(addKeywordToAll(rows, ['a'], '   ')).toEqual(rows)
    expect(addKeywordToAll(rows, ['a'], 'LAKE')[0]?.keywords).toEqual(['Lake'])
  })
})

describe('removeKeywordFromAll', () => {
  it('removes the keyword case-insensitively from selected rows only', () => {
    const rows = [row('a', 'A', ['Lake', 'water']), row('b', 'B', ['lake'])]
    const result = removeKeywordFromAll(rows, ['a', 'b'], 'LAKE')
    expect(result[0]?.keywords).toEqual(['water'])
    expect(result[1]?.keywords).toEqual([])
  })

  it('keeps rows unchanged for a blank keyword', () => {
    const rows = [row('a', 'A', ['lake'])]
    expect(removeKeywordFromAll(rows, ['a'], '')).toEqual(rows)
  })
})

describe('replaceInTitles', () => {
  it('replaces case-insensitively and preserves the rest of the casing', () => {
    const rows = [row('a', 'A Calm LAKE at DAWN', [])]
    const result = replaceInTitles(rows, ['a'], 'lake', 'river')
    expect(result[0]?.title).toBe('A Calm river at DAWN')
  })

  it('replaces every occurrence and only within selected rows', () => {
    const rows = [row('a', 'sun, sun, sun', []), row('b', 'sun', [])]
    const result = replaceInTitles(rows, ['a'], 'sun', 'moon')
    expect(result[0]?.title).toBe('moon, moon, moon')
    expect(result[1]?.title).toBe('sun')
  })

  it('supports empty replacements (deletion)', () => {
    const rows = [row('a', 'Nikon camera', [])]
    expect(replaceInTitles(rows, ['a'], 'Nikon ', '')[0]?.title).toBe('camera')
  })

  it('returns rows untouched when find is empty', () => {
    const rows = [row('a', 'title', [])]
    expect(replaceInTitles(rows, ['a'], '', 'x')).toEqual(rows)
  })
})

describe('countTitleMatches', () => {
  it('counts selected rows containing the needle', () => {
    const rows = [row('a', 'has needle', []), row('b', 'has NEEDLE too', []), row('c', 'nope', [])]
    expect(countTitleMatches(rows, ['a', 'b', 'c'], 'needle')).toBe(2)
    expect(countTitleMatches(rows, ['a'], 'needle')).toBe(1)
    expect(countTitleMatches(rows, ['a'], '')).toBe(0)
  })
})
