import { showSaveDialogInView } from '../../lib/dialogs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { EXPORT } from '@shared/constants'
import { getDb } from '../db'
import { getProjectSummary, setProjectLastExportPath } from '../../db/repositories/projects'
import { AppError } from '../../lib/errors'
import { scopedLogger } from '../logger'
import { getSettingsState } from '../storage/settings'
import { buildStockCsv } from './csv'
import type { CsvRowInput } from './csv'
import { renderFilenamePattern } from './pattern'

const logger = scopedLogger('export')

export interface ExportOptions {
  projectId?: string
}

export interface ExportResult {
  /** Null when the user canceled the save dialog. */
  filePath: string | null
}

export interface ExportService {
  exportCsv(rows: Array<CsvRowInput>, options?: ExportOptions): Promise<ExportResult>
}

/**
 * Writes the Adobe Stock CSV to a user-chosen location via the native save
 * dialog. The default folder, filename pattern, encoding (BOM), and the
 * AI-generated Releases marker all come from settings; the project's last
 * export path is remembered.
 */
export const exportService: ExportService = {
  async exportCsv(rows: Array<CsvRowInput>, options: ExportOptions = {}): Promise<ExportResult> {
    if (rows.length === 0) {
      throw new AppError('VALIDATION', 'There are no rows to export.')
    }

    const settings = await getSettingsState()
    let projectName = 'export'
    let aiGenerated = false
    if (options.projectId) {
      const project = getProjectSummary(getDb(), options.projectId)
      projectName = project.name
      aiGenerated = project.aiGenerated
    }

    const baseName = renderFilenamePattern(settings.filenamePattern, { projectName })
    const fileName = `${baseName}${EXPORT.CSV_FILENAME_EXTENSION}`
    const defaultPath = settings.exportDefaultDir
      ? join(settings.exportDefaultDir, fileName)
      : fileName

    const result = await showSaveDialogInView({
      title: 'Export Adobe Stock CSV',
      defaultPath,
      filters: [{ name: 'CSV (Adobe Stock)', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) {
      logger.debug('CSV export canceled by user')
      return { filePath: null }
    }

    const csv = buildStockCsv(rows, {
      bom: settings.csvEncoding === 'utf8-bom',
      releasesValue: aiGenerated ? EXPORT.AI_RELEASES_MARKER : '',
    })
    await fs.writeFile(result.filePath, csv, 'utf8')
    if (options.projectId) {
      setProjectLastExportPath(getDb(), options.projectId, result.filePath)
    }
    logger.info('CSV exported', {
      filePath: result.filePath,
      rowCount: rows.length,
      encoding: settings.csvEncoding,
      aiGenerated,
    })
    return { filePath: result.filePath }
  },
}
