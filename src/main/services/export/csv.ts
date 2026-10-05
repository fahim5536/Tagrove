/**
 * Adobe Stock CSV builder. Column layout (exact): Filename, Title, Keywords,
 * Category, Releases. Output uses CRLF line endings and proper quoting; the
 * UTF-8 BOM and the Releases marker (for AI-generated projects) are options
 * driven by user settings.
 */

export const CSV_HEADER: Array<string> = ['Filename', 'Title', 'Keywords', 'Category', 'Releases']
/** UTF-8 BOM so Excel opens the file with the right encoding. */
const CSV_BOM = String.fromCharCode(0xfeff)
const CSV_ROW_SEPARATOR = String.fromCharCode(13, 10)
const CSV_FIELD_SEPARATOR = ','

export interface CsvRowInput {
  fileName: string
  title: string
  keywords: Array<string>
  categoryId: string | null
}

export interface BuildCsvOptions {
  /** Prepend a UTF-8 BOM (default true, per the utf8-bom encoding setting). */
  bom?: boolean
  /** Value written into every Releases cell (e.g. the AI-generated marker). */
  releasesValue?: string
}

export function escapeCsvField(value: string): string {
  const needsQuoting = /[",\n\r]/u.test(value)
  return needsQuoting ? `"${value.replaceAll('"', '""')}"` : value
}

export function buildStockCsv(rows: Array<CsvRowInput>, options: BuildCsvOptions = {}): string {
  const { bom = true, releasesValue = '' } = options
  const lines: Array<string> = [CSV_HEADER.join(CSV_FIELD_SEPARATOR)]
  for (const row of rows) {
    const fields = [
      row.fileName,
      row.title,
      row.keywords.join(CSV_FIELD_SEPARATOR),
      row.categoryId ?? '',
      releasesValue,
    ]
    lines.push(fields.map(escapeCsvField).join(CSV_FIELD_SEPARATOR))
  }
  const body = lines.join(CSV_ROW_SEPARATOR) + CSV_ROW_SEPARATOR
  return bom ? `${CSV_BOM}${body}` : body
}
