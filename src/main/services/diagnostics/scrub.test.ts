import { describe, expect, it } from 'vitest'
import { scrubPaths, scrubSensitiveLine } from './index'

const USER_DATA = 'C:\\Users\\tester\\AppData\\Roaming\\Tagrove'

describe('scrubPaths', () => {
  it('replaces the user data folder', () => {
    expect(scrubPaths(`error in ${USER_DATA}\\tagrove.db`, USER_DATA)).toBe(
      'error in [data folder]\\tagrove.db',
    )
  })

  it('replaces Windows and Unix user paths', () => {
    expect(scrubPaths('reading C:\\Users\\tester\\secret.txt', USER_DATA)).toBe(
      'reading [user path]',
    )
    expect(scrubPaths('reading /home/tester/secret.txt', USER_DATA)).toBe('reading [user path]')
    expect(scrubPaths('reading /Users/tester/secret.txt', USER_DATA)).toBe('reading [user path]')
  })

  it('leaves innocuous text alone', () => {
    expect(scrubPaths('Generation finished: 12 images', USER_DATA)).toBe(
      'Generation finished: 12 images',
    )
  })
})

describe('scrubSensitiveLine', () => {
  it('redacts secret-looking JSON values', () => {
    expect(scrubSensitiveLine('{"apiKey":"AIzaSECRET","message":"Generation failed"}')).toBe(
      '{"apiKey":"[REDACTED]","message":"Generation failed"}',
    )
    expect(scrubSensitiveLine('{"Authorization":"Bearer abc"}')).toContain('[REDACTED]')
  })

  it('leaves ordinary lines alone', () => {
    expect(scrubSensitiveLine('API key updated {"keyLength":20}')).toBe(
      'API key updated {"keyLength":20}',
    )
  })
})
