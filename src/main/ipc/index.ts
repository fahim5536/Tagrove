import { registerAiHandlers } from './ai'
import { registerAppHandlers } from './app'
import { registerConfigHandlers } from './config'
import { registerCsvHandlers } from './csv'
import { registerDiagnosticsHandlers } from './diagnostics'
import { registerDataHandlers } from './data'
import { registerGenerationHandlers } from './generation'
import { registerImagesHandlers } from './images'
import { registerLogHandlers } from './log'
import { registerPresetsHandlers } from './presets'
import { registerProjectsHandlers } from './projects'
import { registerSettingsHandlers } from './settings'
import { registerUpdaterHandlers } from './updater'

/** Call once after app.whenReady() (and DB init), before creating any window. */
export function registerIpcHandlers(): void {
  registerAppHandlers()
  registerConfigHandlers()
  registerSettingsHandlers()
  registerImagesHandlers()
  registerProjectsHandlers()
  registerPresetsHandlers()
  registerGenerationHandlers()
  registerAiHandlers()
  registerCsvHandlers()
  registerDataHandlers()
  registerDiagnosticsHandlers()
  registerUpdaterHandlers()
  registerLogHandlers()
}
