import { app, shell } from 'electron'
import { showOpenDialogInView, showSaveDialogInView } from '../lib/dialogs'
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { IPC_CHANNELS, noPayloadSchema } from '@shared/ipc'
import type { Preset } from '@shared/types'
import { getDb } from '../services/db'
import { listPresets, savePreset } from '../db/repositories/presets'
import { clearThumbnailCache } from '../services/images'
import {
  getSettingsState,
  setAppearance,
  setExportOptions,
  setGenerationOptions,
  setLanguage,
  setLastPresetId,
  setModel,
} from '../services/storage/settings'
import { scopedLogger } from '../services/logger'
import { AppError } from '../lib/errors'
import { registerIpcHandler } from './wrapper'
import { applyAppearance } from '../lib/theme'

const logger = scopedLogger('data')

const modelNamePattern = /^[A-Za-z0-9._-]{3,100}$/

const importedConfigSchema = z.object({
  settings: z
    .object({
      model: z.string().regex(modelNamePattern).optional(),
      maxConcurrentRequests: z.number().int().min(1).max(8).optional(),
      modelImageEdge: z
        .number()
        .int()
        .refine((edge) => [512, 768, 1024, 1536].includes(edge))
        .optional(),
      maxRetries: z.number().int().min(0).max(5).optional(),
      exportDefaultDir: z.string().max(500).nullable().optional(),
      csvEncoding: z.enum(['utf8-bom', 'utf8']).optional(),
      filenamePattern: z.string().trim().min(1).max(120).optional(),
      appearance: z.enum(['dark', 'light', 'system']).optional(),
      language: z.enum(['en', 'bn']).optional(),
      lastPresetId: z.string().max(100).nullable().optional(),
    })
    .optional(),
  presets: z
    .array(
      z.object({
        id: z.string().min(1).max(100).optional(),
        name: z.string().trim().min(1).max(80),
        extraInstructions: z.string().max(4000),
        keywordMin: z.number().int().min(1).max(99).nullable(),
        keywordMax: z.number().int().min(1).max(99).nullable(),
        tone: z.string().max(120),
        alwaysInclude: z.array(z.string().min(1).max(100)).max(60),
        neverUse: z.array(z.string().min(1).max(100)).max(120),
      }),
    )
    .max(200)
    .optional(),
})

export function registerDataHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.DATA_OPEN_FOLDER, noPayloadSchema, async () => {
    const error = await shell.openPath(app.getPath('userData'))
    if (error) throw new AppError('INTERNAL', error)
    return { opened: true }
  })

  registerIpcHandler(IPC_CHANNELS.DATA_CHOOSE_FOLDER, noPayloadSchema, async () => {
    const result = await showOpenDialogInView({
      title: 'Choose default export folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    const dir = result.canceled ? null : (result.filePaths[0] ?? null)
    return { dir }
  })

  registerIpcHandler(IPC_CHANNELS.DATA_CLEAR_CACHE, noPayloadSchema, () => ({
    cleared: clearThumbnailCache(),
  }))

  registerIpcHandler(IPC_CHANNELS.DATA_EXPORT_CONFIG, noPayloadSchema, async () => {
    const settings = await getSettingsState()
    const presets = listPresets(getDb())
    const result = await showSaveDialogInView({
      title: 'Export settings and presets',
      defaultPath: 'tagrove-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { filePath: null }
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: {
        model: settings.model,
        maxConcurrentRequests: settings.maxConcurrentRequests,
        modelImageEdge: settings.modelImageEdge,
        maxRetries: settings.maxRetries,
        exportDefaultDir: settings.exportDefaultDir,
        csvEncoding: settings.csvEncoding,
        filenamePattern: settings.filenamePattern,
        appearance: settings.appearance,
        language: settings.language,
        lastPresetId: settings.lastPresetId,
      },
      presets: presets.map((preset: Preset) => ({
        id: preset.id,
        name: preset.name,
        extraInstructions: preset.extraInstructions,
        keywordMin: preset.keywordMin,
        keywordMax: preset.keywordMax,
        tone: preset.tone,
        alwaysInclude: preset.alwaysInclude,
        neverUse: preset.neverUse,
      })),
    }
    await fs.writeFile(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    logger.info('Settings and presets exported', { filePath: result.filePath })
    return { filePath: result.filePath }
  })

  registerIpcHandler(IPC_CHANNELS.DATA_IMPORT_CONFIG, noPayloadSchema, async () => {
    const result = await showOpenDialogInView({
      title: 'Import settings and presets',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return { imported: false, message: 'Import canceled.' }
    }
    const stats = await fs.stat(filePath)
    if (stats.size > 5 * 1024 * 1024) {
      throw new AppError('VALIDATION', 'The configuration file is too large.')
    }
    const parsed = importedConfigSchema.safeParse(JSON.parse(await fs.readFile(filePath, 'utf8')))
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION',
        'The configuration file is not a valid Tagrove config (validation failed).',
      )
    }
    const config = parsed.data
    if (config.settings) {
      if (config.settings.model) await setModel(config.settings.model)
      await setGenerationOptions({
        maxConcurrentRequests: config.settings.maxConcurrentRequests,
        modelImageEdge: config.settings.modelImageEdge,
        maxRetries: config.settings.maxRetries,
      })
      await setExportOptions({
        exportDefaultDir: config.settings.exportDefaultDir,
        csvEncoding: config.settings.csvEncoding,
        filenamePattern: config.settings.filenamePattern,
      })
      if (config.settings.appearance) {
        await setAppearance(config.settings.appearance)
        applyAppearance(config.settings.appearance)
      }
      if (config.settings.language) await setLanguage(config.settings.language)
      if (config.settings.lastPresetId !== undefined) {
        await setLastPresetId(config.settings.lastPresetId)
      }
    }
    let presetCount = 0
    for (const preset of config.presets ?? []) {
      savePreset(getDb(), preset)
      presetCount += 1
    }
    logger.info('Settings and presets imported', {
      presets: presetCount,
      hadSettings: Boolean(config.settings),
    })
    return {
      imported: true,
      message: `Imported ${presetCount} preset(s)${config.settings ? ' and settings' : ''}.`,
    }
  })
}
