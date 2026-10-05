import { app } from 'electron'
import type { WebContents } from 'electron'
import { logger } from './services/logger'

/**
 * Hardening applied to every WebContents the app ever creates. Navigation and
 * window.open are always denied: the renderer has no legitimate reason to
 * navigate itself or spawn windows, and future "open a link" features must go
 * through an explicit, audited main-process service.
 */
export function registerSecurityGuards(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isNavigationAllowed(url)) {
      event.preventDefault()
      logger.warn('Blocked navigation attempt', { url })
    }
  })

  contents.setWindowOpenHandler(({ url }) => {
    logger.warn('Blocked window.open attempt', { url })
    return { action: 'deny' }
  })

  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
    logger.warn('Blocked <webview> attach attempt')
  })
}

function isNavigationAllowed(url: string): boolean {
  if (!app.isPackaged) {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL']
    if (devServerUrl && url.startsWith(devServerUrl)) return true
  }
  return false
}
