/**
 * Renders the user-configurable export filename pattern. Supported tokens:
 * {project} (slugified project name), {date} (YYYY-MM-DD), {time} (HH-mm-ss).
 * Anything filesystem-unsafe is replaced so the result is always a valid name.
 */

export interface FilenamePatternContext {
  projectName: string
  date?: Date
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

export function renderFilenamePattern(pattern: string, context: FilenamePatternContext): string {
  const date = context.date ?? new Date()
  const projectSlug =
    context.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  const rendered = pattern
    .replaceAll('{project}', projectSlug)
    .replaceAll(
      '{date}',
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    )
    .replaceAll(
      '{time}',
      `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
    )
    // Sanitize filesystem-unsafe characters and tidy up the leftovers.
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
  return rendered.length > 0 ? rendered : 'tagrove-export'
}
