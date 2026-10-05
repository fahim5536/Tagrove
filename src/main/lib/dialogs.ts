import { dialog } from 'electron'
import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import { getMainWindow } from '../window'

/**
 * Dialog helpers that parent to the main window when it exists (so dialogs
 * open in front and behave modally) and fall back to parentless dialogs
 * during startup/shutdown edge cases.
 */
export function showOpenDialogInView(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const parent = getMainWindow()
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)
}

export function showSaveDialogInView(options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const parent = getMainWindow()
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
}
