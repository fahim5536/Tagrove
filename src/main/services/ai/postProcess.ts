import { KEYWORD_MAX_LENGTH, KEYWORDS_TARGET_MAX, TITLE_MAX_LENGTH } from '@shared/metadata'
import type { Category, Preset } from '@shared/types'
import type { AiRawOutput } from './gemini'

export interface PostProcessContext {
  categories: Array<Category>
  bannedWords: Array<string>
  /** When set, its never-use list extends the global ban and always-include keywords are prepended. */
  preset?: Preset | null
}

export interface PostProcessResult {
  title: string
  keywords: Array<string>
  categoryId: string | null
}

/** Trims, lowercases, and dedupes the banned list so matching is predictable. */
export function normalizeBannedWords(words: Array<string>): Array<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const word of words) {
    const normalized = word.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Removes banned words (with any preceding space) and collapses leftovers. */
export function stripBannedWords(text: string, banned: Array<string>): string {
  let result = text
  for (const word of banned) {
    result = result.replace(new RegExp(`\\s*\\b${escapeRegExp(word)}\\b`, 'gi'), '')
  }
  return collapseWhitespace(result)
}

export function cleanTitle(rawTitle: string, banned: Array<string>): string {
  const stripped = stripBannedWords(collapseWhitespace(rawTitle), banned)
  const truncated = stripped.slice(0, TITLE_MAX_LENGTH)
  return truncated.replace(/[\s,;:\-–—]+$/u, '').trim()
}

export function containsBannedWord(text: string, banned: Array<string>): boolean {
  return banned.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(text))
}

export function cleanKeywords(
  rawKeywords: Array<string>,
  banned: Array<string>,
  maxCount: number = KEYWORDS_TARGET_MAX,
): Array<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const raw of rawKeywords) {
    const keyword = collapseWhitespace(String(raw))
    if (!keyword) continue
    const lower = keyword.toLowerCase()
    if (seen.has(lower)) continue
    if (containsBannedWord(lower, banned)) continue
    seen.add(lower)
    out.push(
      keyword.length > KEYWORD_MAX_LENGTH
        ? collapseWhitespace(keyword.slice(0, KEYWORD_MAX_LENGTH))
        : keyword,
    )
    if (out.length >= maxCount) break
  }
  return out
}

/**
 * Prepends the preset's always-include keywords (without duplicates, keeping
 * the first spelling) so they survive the keyword cap.
 */
export function applyAlwaysInclude(
  keywords: Array<string>,
  alwaysInclude: Array<string>,
  maxCount: number,
): Array<string> {
  if (alwaysInclude.length === 0) return keywords
  const seen = new Set(keywords.map((keyword) => keyword.toLowerCase()))
  const forced: Array<string> = []
  for (const raw of alwaysInclude) {
    const keyword = collapseWhitespace(raw)
    if (!keyword) continue
    const lower = keyword.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    forced.push(keyword)
  }
  return [...forced, ...keywords].slice(0, maxCount)
}

/** Accepts a category id or name and maps it to a known id; unknown → null. */
export function resolveCategoryId(rawCategory: string, categories: Array<Category>): string | null {
  const trimmed = rawCategory.trim()
  if (!trimmed) return null
  const byId = categories.find((category) => category.id === trimmed)
  if (byId) return byId.id
  const lower = trimmed.toLowerCase()
  const byName = categories.find((category) => category.name.toLowerCase() === lower)
  return byName ? byName.id : null
}

export function postProcessMetadata(
  raw: AiRawOutput,
  context: PostProcessContext,
): PostProcessResult {
  const banned = normalizeBannedWords([...context.bannedWords, ...(context.preset?.neverUse ?? [])])
  const maxKeywords = context.preset?.keywordMax ?? KEYWORDS_TARGET_MAX
  const cleaned = cleanKeywords(raw.keywords, banned, maxKeywords)
  return {
    title: cleanTitle(raw.title, banned),
    keywords: applyAlwaysInclude(cleaned, context.preset?.alwaysInclude ?? [], maxKeywords),
    categoryId: resolveCategoryId(raw.category, context.categories),
  }
}
