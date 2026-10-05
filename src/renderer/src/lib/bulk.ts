import type { ImageRow } from '../store/generation.store'

/**
 * Pure bulk-edit helpers for the results table. They return new row arrays
 * so the store can swap them in and the autosave layer can persist them.
 */

function rowIds(ids: Array<string>): Set<string> {
  return new Set(ids)
}

export function addKeywordToAll(
  rows: Array<ImageRow>,
  selectedIds: Array<string>,
  rawKeyword: string,
): Array<ImageRow> {
  const keyword = rawKeyword.replace(/\s+/g, ' ').trim()
  if (!keyword) return rows
  const selected = rowIds(selectedIds)
  return rows.map((row) => {
    if (!selected.has(row.id)) return row
    if (row.keywords.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) {
      return row
    }
    return { ...row, keywords: [...row.keywords, keyword] }
  })
}

export function removeKeywordFromAll(
  rows: Array<ImageRow>,
  selectedIds: Array<string>,
  rawKeyword: string,
): Array<ImageRow> {
  const keyword = rawKeyword.trim().toLowerCase()
  if (!keyword) return rows
  const selected = rowIds(selectedIds)
  return rows.map((row) => {
    if (!selected.has(row.id)) return row
    if (!row.keywords.some((existing) => existing.toLowerCase() === keyword)) return row
    return {
      ...row,
      keywords: row.keywords.filter((existing) => existing.toLowerCase() !== keyword),
    }
  })
}

export function replaceInTitles(
  rows: Array<ImageRow>,
  selectedIds: Array<string>,
  find: string,
  replaceWith: string,
): Array<ImageRow> {
  if (!find) return rows
  const selected = rowIds(selectedIds)
  const needle = find.toLowerCase()
  return rows.map((row) => {
    if (!selected.has(row.id) || !row.title.toLowerCase().includes(needle)) return row
    // Rebuild via split/join to preserve the original casing around the match.
    const lowerTitle = row.title.toLowerCase()
    let result = ''
    let cursor = 0
    while (cursor < row.title.length) {
      const index = lowerTitle.indexOf(needle, cursor)
      if (index === -1) {
        result += row.title.slice(cursor)
        break
      }
      result += row.title.slice(cursor, index) + replaceWith
      cursor = index + find.length
    }
    return { ...row, title: result }
  })
}

export function countTitleMatches(
  rows: Array<ImageRow>,
  selectedIds: Array<string>,
  find: string,
): number {
  if (!find) return 0
  const selected = rowIds(selectedIds)
  const needle = find.toLowerCase()
  return rows.filter((row) => selected.has(row.id) && row.title.toLowerCase().includes(needle))
    .length
}
