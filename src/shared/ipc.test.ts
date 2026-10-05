import { describe, expect, it } from 'vitest'
import {
  IPC_CHANNELS,
  ipcFailure,
  ipcSuccess,
  logWriteSchema,
  noPayloadSchema,
  setApiKeyRequestSchema,
} from './ipc'

describe('IPC_CHANNELS', () => {
  it('uses unique channel names', () => {
    const names = Object.values(IPC_CHANNELS)
    expect(new Set(names).size).toBe(names.length)
  })

  it('namespaces every channel as domain:action', () => {
    for (const name of Object.values(IPC_CHANNELS)) {
      expect(name).toMatch(/^[a-z-]+:[a-z-]+$/)
    }
  })
})

describe('noPayloadSchema', () => {
  it('accepts undefined only', () => {
    expect(noPayloadSchema.safeParse(undefined).success).toBe(true)
    expect(noPayloadSchema.safeParse({}).success).toBe(false)
    expect(noPayloadSchema.safeParse(null).success).toBe(false)
  })
})

describe('setApiKeyRequestSchema', () => {
  it('accepts a non-empty key', () => {
    expect(setApiKeyRequestSchema.safeParse({ apiKey: 'AIzaTest123' }).success).toBe(true)
  })

  it('rejects empty, missing, oversized, and non-string keys', () => {
    expect(setApiKeyRequestSchema.safeParse({ apiKey: '' }).success).toBe(false)
    expect(setApiKeyRequestSchema.safeParse({}).success).toBe(false)
    expect(setApiKeyRequestSchema.safeParse({ apiKey: 'x'.repeat(513) }).success).toBe(false)
    expect(setApiKeyRequestSchema.safeParse({ apiKey: 42 }).success).toBe(false)
  })
})

describe('logWriteSchema', () => {
  it('accepts a valid entry with optional context', () => {
    expect(logWriteSchema.safeParse({ level: 'info', message: 'hello' }).success).toBe(true)
    expect(
      logWriteSchema.safeParse({
        level: 'error',
        message: 'hello',
        context: { any: [1, 'x', null] },
      }).success,
    ).toBe(true)
  })

  it('rejects unknown levels, empty messages, and non-object context', () => {
    expect(logWriteSchema.safeParse({ level: 'verbose', message: 'hello' }).success).toBe(false)
    expect(logWriteSchema.safeParse({ level: 'info', message: '' }).success).toBe(false)
    expect(
      logWriteSchema.safeParse({ level: 'info', message: 'hello', context: 'nope' }).success,
    ).toBe(false)
  })
})

describe('envelope helpers', () => {
  it('ipcSuccess wraps data', () => {
    expect(ipcSuccess(42)).toEqual({ ok: true, data: 42 })
  })

  it('ipcFailure carries code and message', () => {
    expect(ipcFailure('VALIDATION', 'bad')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'bad' },
    })
  })
})
