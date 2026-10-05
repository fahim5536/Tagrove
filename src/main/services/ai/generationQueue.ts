import { GENERATION } from '@shared/constants'
import type { GenerationEvent } from '@shared/ipc'
import { AppError } from '../../lib/errors'
import { scopedLogger } from '../logger'
import { describeAiError, isRetryableAiError } from './errors'

const logger = scopedLogger('generation')

export interface GenerationResult {
  title: string
  keywords: Array<string>
  categoryId: string | null
}

export interface GenerateQueueItem {
  id: string
  path: string
}

/** Per-run context passed through to the generate function (e.g. the active preset). */
export interface GenerationRunContext {
  presetId: string | null
  preset: unknown | null
}

export interface GenerationQueueDeps {
  generate: (
    item: GenerateQueueItem,
    signal: AbortSignal,
    context: GenerationRunContext,
  ) => Promise<GenerationResult>
  emit: (event: GenerationEvent) => void
  /** Injectable for tests; defaults to a setTimeout-based delay. */
  delay?: (ms: number) => Promise<void>
}

export interface StartOptions {
  concurrency: number
  maxRetries?: number
  context?: GenerationRunContext
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const NO_CONTEXT: GenerationRunContext = { presetId: null, preset: null }

/**
 * Runs image generation with bounded parallelism, exponential backoff on
 * rate limits / network errors, and per-item events. One run at a time;
 * cancel() stops scheduling and aborts in-flight requests.
 */
export class GenerationQueue {
  private readonly generate: GenerationQueueDeps['generate']
  private readonly emit: GenerationQueueDeps['emit']
  private readonly delay: (ms: number) => Promise<void>

  private pending: Array<GenerateQueueItem> = []
  private controller: AbortController | null = null
  private running = false
  private canceled = false
  private completed = 0
  private failed = 0
  private maxAttempts = GENERATION.DEFAULT_MAX_RETRIES + 1
  private context: GenerationRunContext = NO_CONTEXT

  constructor(deps: GenerationQueueDeps) {
    this.generate = deps.generate
    this.emit = deps.emit
    this.delay = deps.delay ?? defaultDelay
  }

  isRunning(): boolean {
    return this.running
  }

  start(items: Array<GenerateQueueItem>, options: StartOptions): void {
    if (this.running) {
      throw new AppError('UNAVAILABLE', 'A generation run is already in progress.')
    }
    if (items.length === 0) {
      throw new AppError('VALIDATION', 'There are no images to generate.')
    }
    this.pending = [...items]
    this.canceled = false
    this.completed = 0
    this.failed = 0
    this.maxAttempts = Math.max(1, (options.maxRetries ?? GENERATION.DEFAULT_MAX_RETRIES) + 1)
    this.context = options.context ?? NO_CONTEXT
    this.controller = new AbortController()
    this.running = true
    this.emit({ type: 'run-started', total: items.length })
    logger.info('Generation run started', {
      items: items.length,
      concurrency: options.concurrency,
      maxAttempts: this.maxAttempts,
      presetId: this.context.presetId,
    })
    void this.runAll(options.concurrency)
  }

  /** Returns true when a running run was actually canceled. */
  cancel(): boolean {
    if (!this.running || this.canceled) return false
    this.canceled = true
    this.pending = []
    this.controller?.abort()
    logger.info('Generation run canceled')
    return true
  }

  private async runAll(concurrency: number): Promise<void> {
    const workerCount = Math.max(1, Math.min(concurrency, this.pending.length))
    await Promise.all(Array.from({ length: workerCount }, () => this.worker()))
    this.running = false
    this.controller = null
    this.emit({
      type: 'run-finished',
      canceled: this.canceled,
      completed: this.completed,
      failed: this.failed,
    })
    logger.info('Generation run finished', {
      canceled: this.canceled,
      completed: this.completed,
      failed: this.failed,
    })
  }

  private async worker(): Promise<void> {
    while (!this.canceled) {
      const item = this.pending.shift()
      if (!item) break
      await this.processItem(item)
    }
  }

  private async processItem(item: GenerateQueueItem): Promise<void> {
    const controller = this.controller
    if (!controller) return
    const signal = controller.signal
    const context = this.context
    this.emit({ type: 'item-started', id: item.id })

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const metadata = await this.generate(item, signal, context)
        this.completed += 1
        this.emit({ type: 'item-completed', id: item.id, metadata })
        return
      } catch (error) {
        if (this.canceled || signal.aborted) {
          this.failed += 1
          this.emit({ type: 'item-failed', id: item.id, message: 'Canceled.', code: 'INTERNAL' })
          return
        }
        const isLastAttempt = attempt >= this.maxAttempts
        if (!isRetryableAiError(error) || isLastAttempt) {
          this.failed += 1
          const message = describeAiError(error)
          const code = error instanceof AppError ? error.code : 'INTERNAL'
          logger.warn('Image generation failed', {
            id: item.id,
            attempt,
            message,
            error: error instanceof Error ? error.stack : String(error),
          })
          this.emit({ type: 'item-failed', id: item.id, message, code })
          return
        }
        const backoffMs = Math.min(
          GENERATION.BACKOFF_BASE_MS * 2 ** (attempt - 1),
          GENERATION.BACKOFF_MAX_MS,
        )
        logger.warn('Retrying image generation after backoff', {
          id: item.id,
          attempt,
          backoffMs,
          reason: error instanceof Error ? error.message : String(error),
        })
        await this.delay(backoffMs)
        if (this.canceled) {
          this.failed += 1
          this.emit({ type: 'item-failed', id: item.id, message: 'Canceled.', code: 'INTERNAL' })
          return
        }
      }
    }
  }
}
