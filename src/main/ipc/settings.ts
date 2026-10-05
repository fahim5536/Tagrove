import {
  IPC_CHANNELS,
  noPayloadSchema,
  setApiKeyRequestSchema,
  setAppearanceRequestSchema,
  setCrashReportsRequestSchema,
  setExportOptionsRequestSchema,
  setGenerationOptionsRequestSchema,
  setLanguageRequestSchema,
  setModelRequestSchema,
  setUpdateChannelRequestSchema,
} from '@shared/ipc'
import {
  clearApiKey,
  getSettingsState,
  setApiKey,
  setAppearance,
  setCrashReports,
  setExportOptions,
  setGenerationOptions,
  setLanguage,
  setModel,
  setUpdateChannel,
} from '../services/storage/settings'
import { applyAppearance } from '../lib/theme'
import { setCrashReportsEnabled as applyCrashReports } from '../services/diagnostics'
import { registerIpcHandler } from './wrapper'

export function registerSettingsHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET_STATE, noPayloadSchema, () => getSettingsState())
  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_API_KEY, setApiKeyRequestSchema, (request) =>
    setApiKey(request.apiKey),
  )
  registerIpcHandler(IPC_CHANNELS.SETTINGS_CLEAR_API_KEY, noPayloadSchema, () => clearApiKey())
  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_MODEL, setModelRequestSchema, (request) =>
    setModel(request.model),
  )
  registerIpcHandler(
    IPC_CHANNELS.SETTINGS_SET_GENERATION,
    setGenerationOptionsRequestSchema,
    (request) => setGenerationOptions(request),
  )
  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_EXPORT, setExportOptionsRequestSchema, (request) =>
    setExportOptions(request),
  )
  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_APPEARANCE, setAppearanceRequestSchema, (request) =>
    setAppearance(request.appearance).then(() => applyAppearance(request.appearance)),
  )
  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_LANGUAGE, setLanguageRequestSchema, (request) =>
    setLanguage(request.language),
  )
  registerIpcHandler(IPC_CHANNELS.UPDATER_SET_CHANNEL, setUpdateChannelRequestSchema, (request) =>
    setUpdateChannel(request.channel),
  )

  registerIpcHandler(
    IPC_CHANNELS.SETTINGS_SET_CRASH_REPORTS,
    setCrashReportsRequestSchema,
    (request) =>
      setCrashReports(request.enabled).then((state) => {
        applyCrashReports(request.enabled)
        return state
      }),
  )
}
