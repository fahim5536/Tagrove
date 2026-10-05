/**
 * Shared metadata limits and validation. Used by the main process after AI
 * post-processing and by the renderer for live row validation and export
 * warnings, so both sides always agree on the rules.
 */

export const TITLE_MAX_LENGTH = 200
export const KEYWORD_MAX_LENGTH = 64
/** Adobe Stock accepts 25–49 keywords for submission; we generate 30–49. */
export const KEYWORDS_WARN_MIN = 25
export const KEYWORDS_TARGET_MAX = 49

export type MetadataIssueSeverity = 'error' | 'warning'

export type MetadataField = 'title' | 'keywords' | 'category'

export interface MetadataIssue {
  field: MetadataField
  severity: MetadataIssueSeverity
  message: string
}

export interface MetadataForValidation {
  title: string
  keywords: string[]
  categoryId: string | null
}

export function validateMetadata(input: MetadataForValidation): Array<MetadataIssue> {
  const issues: Array<MetadataIssue> = []
  const title = input.title.trim()

  if (title.length === 0) {
    issues.push({ field: 'title', severity: 'error', message: 'Title is empty' })
  } else if (title.length > TITLE_MAX_LENGTH) {
    issues.push({
      field: 'title',
      severity: 'error',
      message: `Title is ${title.length} characters (max ${TITLE_MAX_LENGTH})`,
    })
  }

  if (input.keywords.length === 0) {
    issues.push({ field: 'keywords', severity: 'error', message: 'No keywords' })
  } else if (input.keywords.length < KEYWORDS_WARN_MIN) {
    issues.push({
      field: 'keywords',
      severity: 'warning',
      message: `Only ${input.keywords.length} keywords (aim for ${KEYWORDS_WARN_MIN}–${KEYWORDS_TARGET_MAX})`,
    })
  } else if (input.keywords.length > KEYWORDS_TARGET_MAX) {
    issues.push({
      field: 'keywords',
      severity: 'warning',
      message: `${input.keywords.length} keywords (max ${KEYWORDS_TARGET_MAX})`,
    })
  }

  if (input.categoryId === null || input.categoryId === '') {
    issues.push({ field: 'category', severity: 'warning', message: 'No category selected' })
  }

  return issues
}
