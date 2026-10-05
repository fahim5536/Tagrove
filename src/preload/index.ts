import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { GenerationEvent, TagroveApi, UpdaterEvent } from '../shared/ipc'

/**
 * The only bridge between the sandboxed renderer and the main process.
 * Every method maps 1:1 to a channel declared in src/shared/ipc.ts, and the
 * main side validates each payload with the matching zod schema before any
 * handler runs. onEvent() is subscription plumbing for main→renderer events;
 * no business logic lives here.
 */
const api: TagroveApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
  },
  config: {
    getCategories: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_CATEGORIES),
  },
  settings: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_STATE),
    setApiKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_API_KEY, request),
    clearApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_API_KEY),
    setModel: (request) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_MODEL, request),
    setGenerationOptions: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_GENERATION, request),
    setExportOptions: (request) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_EXPORT, request),
    setAppearance: (request) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_APPEARANCE, request),
    setLanguage: (request) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_LANGUAGE, request),
    setCrashReports: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_CRASH_REPORTS, request),
  },
  images: {
    // Electron removed File.path; webUtils resolves the absolute path in preload.
    getPathForFile: (file) => webUtils.getPathForFile(file),
    pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.IMAGES_PICK_FILES),
    add: (request) => ipcRenderer.invoke(IPC_CHANNELS.IMAGES_ADD, request),
    relink: (request) => ipcRenderer.invoke(IPC_CHANNELS.IMAGES_RELINK, request),
    getThumbnail: (request) => ipcRenderer.invoke(IPC_CHANNELS.IMAGES_GET_THUMBNAIL, request),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    get: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_GET, request),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_GET_ACTIVE),
    create: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_CREATE, request),
    setActive: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SET_ACTIVE, request),
    rename: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_RENAME, request),
    duplicate: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DUPLICATE, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, request),
    saveMetadata: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SAVE_METADATA, request),
    setAiGenerated: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SET_AI_GENERATED, request),
  },
  presets: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PRESETS_LIST),
    save: (request) => ipcRenderer.invoke(IPC_CHANNELS.PRESETS_SAVE, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.PRESETS_DELETE, request),
  },
  generation: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.GENERATION_START, request),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.GENERATION_CANCEL),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: GenerationEvent): void => {
        listener(payload)
      }
      ipcRenderer.on(IPC_CHANNELS.GENERATION_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.GENERATION_EVENT, handler)
      }
    },
  },
  ai: {
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION),
  },
  csv: {
    export: (request) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CSV, request),
  },
  data: {
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_OPEN_FOLDER),
    chooseFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_CHOOSE_FOLDER),
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_CLEAR_CACHE),
    exportConfig: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_EXPORT_CONFIG),
    importConfig: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_IMPORT_CONFIG),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL),
    setChannel: (request) => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_SET_CHANNEL, request),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: UpdaterEvent): void => {
        listener(payload)
      }
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT, handler)
      }
    },
  },
  diagnostics: {
    copy: () => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_COPY),
  },
  log: {
    write: (entry) => ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, entry),
  },
}

contextBridge.exposeInMainWorld('api', api)
