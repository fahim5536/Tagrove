import { IPC_CHANNELS, generationStartRequestSchema, noPayloadSchema } from '@shared/ipc'
import type { GenerationEvent, Preset } from '@shared/ipc'
import { GenerationQueue } from '../services/ai/generationQueue'
import { aiService } from '../services/ai'
import { getDb } from '../services/db'
import { getPreset } from '../db/repositories/presets'
import { saveGenerationResult, setImageMissing, setImageStatus } from '../db/repositories/projects'
import { getSettingsState, setLastPresetId } from '../services/storage/settings'
import { getMainWindow } from '../window'
import { scopedLogger } from '../services/logger'
import { registerIpcHandler } from './wrapper'

const logger = scopedLogger('generation')

/**
 * The queue is a main-process singleton; its events are pushed to the focused
 * window over the GENERATION_EVENT channel (validated again on the renderer
 * side with the zod event schema) AND persisted to the database so projects
 * survive restarts.
 */
const generationQueue = new GenerationQueue({
  generate: (item, signal, context) =>
    aiService.generateMetadata(
      { imagePath: item.path },
      { signal, preset: context.preset as Preset | null },
    ),
  emit: (event) => {
    persistEvent(event)
    getMainWindow()?.webContents.send(IPC_CHANNELS.GENERATION_EVENT, event)
  },
})

// The item-completed event does not carry the model, so remember what the
// current run uses (one run at a time).
let currentRunModel: string | null = null
let currentRunPresetId: string | null = null

function persistEvent(event: GenerationEvent): void {
  try {
    const db = getDb()
    if (event.type === 'item-started') {
      setImageStatus(db, event.id, 'running', null)
    } else if (event.type === 'item-completed') {
      saveGenerationResult(db, event.id, {
        title: event.metadata.title,
        keywords: event.metadata.keywords,
        categoryId: event.metadata.categoryId,
        model: currentRunModel,
        presetId: currentRunPresetId,
      })
    } else if (event.type === 'item-failed') {
      if (event.code === 'NOT_FOUND') {
        setImageMissing(db, event.id, true)
      }
      setImageStatus(db, event.id, 'failed', event.message)
    }
  } catch (error) {
    logger.error('Failed to persist generation event', {
      error: error instanceof Error ? error.stack : String(error),
    })
  }
}

export function registerGenerationHandlers(): void {
  registerIpcHandler(
    IPC_CHANNELS.GENERATION_START,
    generationStartRequestSchema,
    async (request) => {
      const settings = await getSettingsState()
      const preset = request.presetId ? getPreset(getDb(), request.presetId) : null
      if (request.presetId && !preset) {
        logger.warn('Requested preset not found; generating without one', {
          presetId: request.presetId,
        })
      }
      currentRunModel = settings.model
      currentRunPresetId = preset?.id ?? null
      if (request.presetId) await setLastPresetId(preset ? request.presetId : null)
      generationQueue.start(request.items, {
        concurrency: settings.maxConcurrentRequests,
        maxRetries: settings.maxRetries,
        context: { presetId: currentRunPresetId, preset },
      })
      return { started: true }
    },
  )

  registerIpcHandler(IPC_CHANNELS.GENERATION_CANCEL, noPayloadSchema, () => ({
    canceled: generationQueue.cancel(),
  }))
}
