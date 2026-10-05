import { nativeTheme } from 'electron'
import { APPEARANCE, WINDOW } from '@shared/constants'
import type { AppearanceMode } from '@shared/types'
import { getMainWindow } from '../window'

/**
 * Applies an appearance mode to the OS integration: nativeTheme drives
 * Chromium's prefers-color-scheme (which the renderer's "system" mode reads)
 * and the window background matches to avoid white flashes.
 */
export function applyAppearance(mode: AppearanceMode): void {
  nativeTheme.themeSource = mode
  const effectiveDark = mode === 'dark' || (mode === 'system' && nativeTheme.shouldUseDarkColors)
  getMainWindow()?.setBackgroundColor(
    effectiveDark ? WINDOW.BACKGROUND_COLOR : APPEARANCE.LIGHT_BACKGROUND_COLOR,
  )
}
