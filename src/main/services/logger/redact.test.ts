import { describe, expect, it } from 'vitest'
import { isSecretKey, redactSecrets } from './redact'

describe('isSecretKey', () => {
  it('matches secret-looking keys case-insensitively', () => {
    expect(isSecretKey('apiKey')).toBe(true)
    expect(isSecretKey('API_KEY')).toBe(true)
    expect(isSecretKey('client_secret')).toBe(true)
    expect(isSecretKey('accessToken')).toBe(true)
    expect(isSecretKey('Authorization')).toBe(true)
  })

  it('ignores ordinary keys', () => {
    expect(isSecretKey('userName')).toBe(false)
    expect(isSecretKey('message')).toBe(false)
    expect(isSecretKey('channel')).toBe(false)
  })
})

describe('redactSecrets', () => {
  it('redacts values under secret keys', () => {
    expect(redactSecrets({ apiKey: 'abc123', size: 3 })).toEqual({ apiKey: '[REDACTED]', size: 3 })
  })

  it('redacts nested and array values without mutating the input', () => {
    const input = {
      req: { headers: { Authorization: 'Bearer x' } },
      list: [{ password: 'h' }],
      note: 'ok',
    }
    const output = redactSecrets(input)
    expect(output).toEqual({
      req: { headers: { Authorization: '[REDACTED]' } },
      list: [{ password: '[REDACTED]' }],
      note: 'ok',
    })
    expect(input.req.headers.Authorization).toBe('Bearer x')
    expect(input.list[0]?.password).toBe('h')
  })

  it('converts Error instances to name and message', () => {
    expect(redactSecrets(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' })
  })

  it('passes primitives through', () => {
    expect(redactSecrets('plain')).toBe('plain')
    expect(redactSecrets(7)).toBe(7)
    expect(redactSecrets(null)).toBe(null)
  })
})
