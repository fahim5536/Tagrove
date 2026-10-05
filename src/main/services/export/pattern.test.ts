import { describe, expect, it } from 'vitest'
import { renderFilenamePattern } from './pattern'

const DATE = new Date(2026, 9, 3, 14, 5, 9)

describe('renderFilenamePattern', () => {
  it('replaces project, date, and time tokens', () => {
    expect(
      renderFilenamePattern('{project}-{date}', { projectName: 'Beach shoot', date: DATE }),
    ).toBe('beach-shoot-2026-10-03')
    expect(
      renderFilenamePattern('{project}_{date}_{time}', { projectName: 'Test', date: DATE }),
    ).toBe('test_2026-10-03_14-05-09')
  })

  it('slugifies the project name', () => {
    expect(
      renderFilenamePattern('{project}', { projectName: ' Ärger & Beiträge!!! ', date: DATE }),
    ).toBe('rger-beitr-ge')
  })

  it('strips filesystem-unsafe characters', () => {
    expect(renderFilenamePattern('file-{date}: *bad?', { projectName: 'x', date: DATE })).toBe(
      'file-2026-10-03-bad',
    )
  })

  it('falls back to a default name when everything is stripped', () => {
    expect(renderFilenamePattern('???', { projectName: 'x', date: DATE })).toBe('tagrove-export')
    expect(renderFilenamePattern('   ', { projectName: 'x', date: DATE })).toBe('tagrove-export')
  })
})
