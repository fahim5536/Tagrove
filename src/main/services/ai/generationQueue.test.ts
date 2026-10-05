import { describe, expect, it, vi } from 'vitest'
import type { GenerationEvent } from '@shared/ipc'
import { describeAiError, isRetryableAiError } from './errors'
import { GenerationQueue } from './generationQueue'
import type { GenerationResult } from './generationQueue'

const META: GenerationResult = { title: 'A calm lake', keywords: ['lake'], categoryId: '11' }

function rateLimitError(): { status: number; message: string } {
  return { status: 429, message: '429 RESOURCE_EXHAUSTED' }
}

interface Harness {
  events: Array<GenerationEvent>
  delays: Array<number>
  queue: GenerationQueue
}

function makeHarness(
  generate: (item: { id: string; path: string }, signal: AbortSignal) => Promise<GenerationResult>,
): Harness {
  const events: Array<GenerationEvent> = []
  const delays: Array<number> = []
  const queue = new GenerationQueue({
    generate,
    emit: (event) => events.push(event),
    delay: async (ms) => {
      delays.push(ms)
    },
  })
  return { events, delays, queue }
}

function lastEvent(events: Array<GenerationEvent>): GenerationEvent {
  const event = events[events.length - 1]
  if (!event) throw new Error('No events emitted')
  return event
}

async function waitForRunFinished(events: Array<GenerationEvent>): Promise<void> {
  await vi.waitFor(() => {
    expect(lastEvent(events).type).toBe('run-finished')
  })
}

function items(count: number): Array<{ id: string; path: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index + 1}`,
    path: `/p/${index + 1}.jpg`,
  }))
}

describe('GenerationQueue', () => {
  it('processes items with at most N in flight and completes all of them', async () => {
    let active = 0
    let peak = 0
    const generate = vi.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
      return META
    })
    const { events, queue } = makeHarness(generate)

    queue.start(items(6), { concurrency: 2 })
    await waitForRunFinished(events)

    expect(peak).toBe(2)
    expect(generate).toHaveBeenCalledTimes(6)
    expect(events.filter((event) => event.type === 'item-completed')).toHaveLength(6)
    const finished = lastEvent(events)
    expect(finished).toMatchObject({
      type: 'run-finished',
      canceled: false,
      completed: 6,
      failed: 0,
    })
  })

  it('retries rate limits with exponential backoff and then succeeds', async () => {
    const generate = vi.fn().mockRejectedValueOnce(rateLimitError()).mockResolvedValueOnce(META)
    const { events, delays, queue } = makeHarness(generate)

    queue.start(items(1), { concurrency: 1 })
    await waitForRunFinished(events)

    expect(delays).toEqual([1000])
    const finished = lastEvent(events)
    expect(finished).toMatchObject({ type: 'run-finished', completed: 1, failed: 0 })
    expect(events.some((event) => event.type === 'item-completed')).toBe(true)
  })

  it('gives up after the first attempt plus MAX_RETRIES retries', async () => {
    const generate = vi.fn(async () => {
      throw rateLimitError()
    })
    const { events, delays, queue } = makeHarness(generate)

    queue.start(items(1), { concurrency: 1 })
    await waitForRunFinished(events)

    expect(generate).toHaveBeenCalledTimes(4)
    expect(delays).toEqual([1000, 2000, 4000])
    const failure = events.find((event) => event.type === 'item-failed')
    expect(failure).toMatchObject({
      type: 'item-failed',
      message: expect.stringContaining('Rate limited'),
    })
    expect(lastEvent(events)).toMatchObject({ type: 'run-finished', completed: 0, failed: 1 })
  })

  it('caps the backoff at BACKOFF_MAX_MS', async () => {
    const generate = vi.fn(async () => {
      throw { status: 500, message: 'internal server error' }
    })
    const { events, delays, queue } = makeHarness(generate)

    queue.start(items(1), { concurrency: 1 })
    await waitForRunFinished(events)

    expect(delays).toEqual([1000, 2000, 4000])
  })

  it('fails fast on non-retryable errors', async () => {
    const generate = vi.fn(async () => {
      throw new Error('The AI response was not valid JSON.')
    })
    const { events, delays, queue } = makeHarness(generate)

    queue.start(items(1), { concurrency: 1 })
    await waitForRunFinished(events)

    expect(generate).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
    expect(events.some((event) => event.type === 'item-failed')).toBe(true)
  })

  it('stop scheduling and aborts in-flight work when canceled', async () => {
    const deferred: { resolve?: (value: GenerationResult) => void } = {}
    const generate = vi.fn(
      () =>
        new Promise<GenerationResult>((resolve) => {
          deferred.resolve = resolve
        }),
    )
    const { events, queue } = makeHarness(generate)

    queue.start(items(3), { concurrency: 1 })
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'item-started')).toBe(true)
    })

    expect(queue.cancel()).toBe(true)
    const first = deferred.resolve
    if (!first) throw new Error('generate promise was not created')
    first(META)
    await waitForRunFinished(events)

    expect(generate).toHaveBeenCalledTimes(1)
    // The in-flight request finished before the abort landed, so it counts as done.
    expect(events.filter((event) => event.type === 'item-completed')).toHaveLength(1)
    expect(lastEvent(events)).toMatchObject({
      type: 'run-finished',
      canceled: true,
      completed: 1,
      failed: 0,
    })
    expect(queue.cancel()).toBe(false)
  })

  it('marks an in-flight item as canceled when it rejects after cancel', async () => {
    const deferred: { reject?: (error: unknown) => void } = {}
    const generate = vi.fn(
      () =>
        new Promise<GenerationResult>((_resolve, reject) => {
          deferred.reject = reject
        }),
    )
    const { events, queue } = makeHarness(generate)

    queue.start(items(2), { concurrency: 1 })
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'item-started')).toBe(true)
    })
    expect(queue.cancel()).toBe(true)
    const reject = deferred.reject
    if (!reject) throw new Error('generate promise was not created')
    reject(new Error('Request aborted'))
    await waitForRunFinished(events)

    expect(events.find((event) => event.type === 'item-failed')).toMatchObject({
      type: 'item-failed',
      message: 'Canceled.',
    })
    expect(lastEvent(events)).toMatchObject({ type: 'run-finished', canceled: true, failed: 1 })
  })

  it('refuses to start a second run while one is in progress', async () => {
    const deferred: { resolve?: (value: GenerationResult) => void } = {}
    const generate = vi.fn(
      () =>
        new Promise<GenerationResult>((resolve) => {
          deferred.resolve = resolve
        }),
    )
    const { queue } = makeHarness(generate)

    queue.start(items(1), { concurrency: 1 })
    expect(() => queue.start(items(1), { concurrency: 1 })).toThrow(/already in progress/)
    const resolve = deferred.resolve
    if (!resolve) throw new Error('generate promise was not created')
    resolve(META)
    await vi.waitFor(() => {
      expect(queue.isRunning()).toBe(false)
    })
  })
})

describe('isRetryableAiError / describeAiError', () => {
  it('classifies rate limits, server errors, and network problems as retryable', () => {
    expect(isRetryableAiError({ status: 429 })).toBe(true)
    expect(isRetryableAiError({ status: 503 })).toBe(true)
    expect(isRetryableAiError(new Error('fetch failed'))).toBe(true)
    expect(isRetryableAiError(new Error('ETIMEDOUT while calling Gemini'))).toBe(true)
  })

  it('treats cancellation, bad payloads, and client errors as non-retryable', () => {
    expect(isRetryableAiError(new Error('Request aborted'))).toBe(false)
    expect(isRetryableAiError(new Error('The AI response was not valid JSON.'))).toBe(false)
    expect(isRetryableAiError({ status: 400, message: 'API key not valid' })).toBe(false)
  })

  it('maps errors to friendly messages', () => {
    expect(describeAiError({ status: 429 })).toContain('Rate limited')
    expect(describeAiError(new Error('fetch failed'))).toContain('Network error')
    expect(describeAiError({ status: 403 })).toContain('API key')
    expect(describeAiError(new Error('Request aborted'))).toBe('Canceled.')
  })
})
