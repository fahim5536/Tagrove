import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'
import { APP_NAME, WINDOW } from '@shared/constants'
import { logger } from './services/logger'

let mainWindow: BrowserWindow | null = null

function resolveIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(__dirname, '..', '..', 'resources', 'icon.png')
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow) {
    mainWindow.focus()
    return mainWindow
  }

  const window = new BrowserWindow({
    width: WINDOW.DEFAULT_WIDTH,
    height: WINDOW.DEFAULT_HEIGHT,
    minWidth: WINDOW.MIN_WIDTH,
    minHeight: WINDOW.MIN_HEIGHT,
    title: APP_NAME,
    show: false,
    backgroundColor: WINDOW.BACKGROUND_COLOR,
    icon: resolveIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  window.once('ready-to-show', () => {
    window.show()
    window.focus()
  })

  window.on('closed', () => {
    mainWindow = null
  })

  // Keep the OS-level window title stable regardless of what the page sets.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      logger.error('Renderer process gone', { reason: details.reason, exitCode: details.exitCode })
    }
  })

  window.webContents.on('unresponsive', () => {
    logger.warn('Main window became unresponsive')
  })

  window.webContents.on('responsive', () => {
    logger.info('Main window recovered from being unresponsive')
  })

  if (app.isPackaged) {
    void window.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  } else {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devServerUrl) {
      throw new Error('ELECTRON_RENDERER_URL is not set. Run the app with `npm run dev`.')
    }
    void window.loadURL(devServerUrl)
    // The application menu is removed, so restore devtools shortcuts in dev.
    window.webContents.on('before-input-event', (event, input) => {
      const isF12 = input.type === 'keyDown' && input.key === 'F12'
      const isCtrlShiftI =
        input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i'
      if (isF12 || isCtrlShiftI) {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  mainWindow = window
  logger.debug('Main window created')
  return window
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
