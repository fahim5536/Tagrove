import { describe, expect, it } from 'vitest'
import {
  KEYWORDS_TARGET_MAX,
  KEYWORDS_WARN_MIN,
  TITLE_MAX_LENGTH,
  validateMetadata,
} from './metadata'

function validInput() {
  return {
    title: 'A calm mountain lake at sunrise',
    keywords: Array.from({ length: 35 }, (_, index) => `keyword${index + 1}`),
    categoryId: '11',
  }
}

describe('validateMetadata', () => {
  it('passes a fully valid row without issues', () => {
    expect(validateMetadata(validInput())).toEqual([])
  })

  it('flags an empty title as an error', () => {
    const issues = validateMetadata({ ...validInput(), title: '   ' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'title', severity: 'error' })
  })

  it(`flags titles longer than ${TITLE_MAX_LENGTH} characters as an error`, () => {
    const issues = validateMetadata({ ...validInput(), title: 'a'.repeat(TITLE_MAX_LENGTH + 1) })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'title', severity: 'error' })
    expect(issues[0]?.message).toContain(String(TITLE_MAX_LENGTH + 1))
  })

  it('flags missing keywords as an error', () => {
    const issues = validateMetadata({ ...validInput(), keywords: [] })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'keywords', severity: 'error' })
  })

  it(`warns when there are fewer than ${KEYWORDS_WARN_MIN} keywords`, () => {
    const issues = validateMetadata({ ...validInput(), keywords: ['a', 'b'] })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'keywords', severity: 'warning' })
  })

  it(`warns when there are more than ${KEYWORDS_TARGET_MAX} keywords`, () => {
    const issues = validateMetadata({
      ...validInput(),
      keywords: Array.from({ length: KEYWORDS_TARGET_MAX + 1 }, (_, index) => `k${index}`),
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'keywords', severity: 'warning' })
  })

  it('accepts the 25–49 keyword range without warnings', () => {
    const issues = validateMetadata({
      ...validInput(),
      keywords: Array.from({ length: KEYWORDS_WARN_MIN }, (_, index) => `k${index}`),
    })
    expect(issues).toEqual([])
  })

  it('warns when no category is selected', () => {
    const issues = validateMetadata({ ...validInput(), categoryId: null })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'category', severity: 'warning' })
  })

  it('collects every issue for a fully broken row', () => {
    const issues = validateMetadata({ title: '', keywords: [], categoryId: null })
    expect(issues).toHaveLength(3)
  })
})
