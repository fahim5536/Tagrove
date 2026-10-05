import { basename } from 'node:path'
import type { Preset, TestConnectionResult } from '@shared/types'
import { loadBannedWords, loadCategories } from '../../config/lists'
import { AppError } from '../../lib/errors'
import { scopedLogger } from '../logger'
import { prepareImageForModel } from '../images'
import { getApiKey, getSettingsState } from '../storage/settings'
import { callGemini, parseAiOutput, pingGemini } from './gemini'
import type { AiRawOutput } from './gemini'
import { AiOutputError, describeAiError } from './errors'
import { buildMetadataPrompt } from './prompt'
import { postProcessMetadata } from './postProcess'

export interface GenerateMetadataInput {
  imagePath: string
}

export interface GenerateMetadataOptions {
  signal?: AbortSignal
  preset?: Preset | null
}

export interface GenerateMetadataResult {
  title: string
  keywords: Array<string>
  categoryId: string | null
}

export interface AiService {
  /** True when an API key is stored and the service can be called. */
  isConfigured(): Promise<boolean>
  generateMetadata(
    input: GenerateMetadataInput,
    options?: GenerateMetadataOptions,
  ): Promise<GenerateMetadataResult>
  /** Lightweight round trip for the Settings "Test connection" button. */
  testConnection(): Promise<TestConnectionResult>
}

const logger = scopedLogger('ai')

/**
 * Gemini integration. Everything privileged happens here in main: the API key
 * is decrypted per call, images are downscaled before upload, the model is
 * forced into JSON via a response schema, and the output is zod-validated
 * (one retry) and post-processed before it ever reaches the renderer.
 */
export const aiService: AiService = {
  async isConfigured() {
    return (await getApiKey()) !== null
  },

  async generateMetadata(input: GenerateMetadataInput, options: GenerateMetadataOptions = {}) {
    const apiKey = await getApiKey()
    if (!apiKey) {
      throw new AppError('UNAVAILABLE', 'No Gemini API key is configured. Add one in Settings.')
    }
    const categories = loadCategories()
    const preset = options.preset ?? null
    const { model } = await getSettingsState()
    const image = await prepareImageForModel(input.imagePath)
    const prompt = buildMetadataPrompt(categories, preset)

    const runModel = async (): Promise<AiRawOutput> => {
      const text = await callGemini({
        apiKey,
        model,
        imageBase64: image.base64,
        prompt,
        signal: options.signal,
      })
      return parseAiOutput(text)
    }

    let raw: AiRawOutput
    try {
      raw = await runModel()
    } catch (error) {
      if (!(error instanceof AiOutputError)) throw error
      logger.warn('AI returned an unusable payload; retrying once', {
        fileName: basename(input.imagePath),
        message: error.message,
      })
      raw = await runModel()
    }

    const result = postProcessMetadata(raw, {
      categories,
      bannedWords: loadBannedWords(),
      preset,
    })
    logger.info('Metadata generated', {
      fileName: basename(input.imagePath),
      titleLength: result.title.length,
      keywordCount: result.keywords.length,
      categoryId: result.categoryId,
      presetId: preset?.id ?? null,
    })
    return result
  },

  async testConnection() {
    const apiKey = await getApiKey()
    if (!apiKey) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'No Gemini API key is configured. Add one in Settings.',
      }
    }
    const { model } = await getSettingsState()
    const startedAt = Date.now()
    try {
      await pingGemini(apiKey, model)
      const latencyMs = Date.now() - startedAt
      logger.info('Gemini connection test succeeded', { model, latencyMs })
      return { ok: true, latencyMs, error: null }
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      const friendly = describeAiError(error)
      logger.warn('Gemini connection test failed', {
        model,
        latencyMs,
        error: error instanceof Error ? error.stack : String(error),
      })
      return { ok: false, latencyMs, error: friendly }
    }
  },
}
