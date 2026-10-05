import { describe, expect, it } from 'vitest'
import { CSV_HEADER, buildStockCsv, escapeCsvField } from './csv'

const BOM = String.fromCharCode(0xfeff)
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const CRLF = CR + LF

function row(
  overrides: Partial<{
    fileName: string
    title: string
    keywords: Array<string>
    categoryId: string | null
  }> = {},
) {
  return {
    fileName: 'photo.jpg',
    title: 'A calm lake at sunrise',
    keywords: ['lake', 'sunrise', 'water'],
    categoryId: '11',
    ...overrides,
  }
}

describe('escapeCsvField', () => {
  it('leaves plain fields untouched', () => {
    expect(escapeCsvField('plain')).toBe('plain')
  })

  it('quotes fields containing commas', () => {
    expect(escapeCsvField('sunset, ocean')).toBe('"sunset, ocean"')
  })

  it('quotes fields containing quotes and doubles the quotes', () => {
    expect(escapeCsvField('He said "hello"')).toBe('"He said ""hello"""')
  })

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField(`line1${LF}line2`)).toBe(`"line1${LF}line2"`)
    expect(escapeCsvField(`line1${CRLF}line2`)).toBe(`"line1${CRLF}line2"`)
  })
})

describe('buildStockCsv', () => {
  it('starts with a UTF-8 BOM followed by the exact header', () => {
    const csv = buildStockCsv([])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe(`${CSV_HEADER.join(',')}${CRLF}`)
    expect(CSV_HEADER).toEqual(['Filename', 'Title', 'Keywords', 'Category', 'Releases'])
  })

  it('quotes the whole keywords field because commas separate keywords inside one column', () => {
    const csv = buildStockCsv([row()])
    expect(csv).toBe(
      `${BOM}Filename,Title,Keywords,Category,Releases${CRLF}photo.jpg,A calm lake at sunrise,"lake,sunrise,water",11,${CRLF}`,
    )
  })

  it('quotes titles that contain commas', () => {
    const csv = buildStockCsv([row({ title: 'sunset, ocean breeze' })])
    expect(csv).toContain('"sunset, ocean breeze"')
  })

  it('doubles quotes inside titles', () => {
    const csv = buildStockCsv([row({ title: 'The "golden" hour' })])
    expect(csv).toContain('"The ""golden"" hour"')
  })

  it('keeps newlines inside quoted title fields', () => {
    const csv = buildStockCsv([row({ title: `line1${LF}line2` })])
    const lines = csv.split(CRLF)
    expect(lines[1]).toBe('photo.jpg,"line1' + LF + 'line2","lake,sunrise,water",11,')
  })

  it('doubles quotes that appear inside the keywords field', () => {
    const csv = buildStockCsv([row({ keywords: ['plain', 'the "good" old days'] })])
    expect(csv).toContain('"plain,the ""good"" old days"')
  })

  it('writes an empty category for null and always ends with CRLF', () => {
    const csv = buildStockCsv([row({ categoryId: null })])
    expect(csv.endsWith(`photo.jpg,A calm lake at sunrise,"lake,sunrise,water",,${CRLF}`)).toBe(
      true,
    )
    expect(csv.endsWith(CRLF)).toBe(true)
    expect(csv).not.toContain('undefined')
  })

  it('preserves unicode characters', () => {
    const csv = buildStockCsv([row({ title: 'Bäume im Nebel — Frühling' })])
    expect(csv).toContain('Bäume im Nebel — Frühling')
  })

  it('omits the BOM when encoding is plain utf8', () => {
    const csv = buildStockCsv([row()], { bom: false })
    expect(csv.charCodeAt(0)).toBe('F'.charCodeAt(0))
  })

  it('writes the Releases marker for AI-generated projects', () => {
    const csv = buildStockCsv([row()], { releasesValue: 'ai-generated' })
    expect(csv).toContain('photo.jpg,A calm lake at sunrise,"lake,sunrise,water",11,ai-generated')
  })
})
