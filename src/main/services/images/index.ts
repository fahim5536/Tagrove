import { dialog } from 'electron'
import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import { GEMINI, IMAGES } from '@shared/constants'
import type { ImportedImage, RejectedFile, ThumbnailData } from '@shared/types'
import { getDb } from '../db'
import {
  ensureActiveProject,
  findExistingHashes,
  getImageProjectId,
  insertImages,
  relinkImage as persistRelink,
} from '../../db/repositories/projects'
import type { NewImageInput } from '../../db/repositories/projects'
import { AppError } from '../../lib/errors'
import { sha256File } from '../../lib/hash'
import { scopedLogger } from '../logger'
import { getSettingsState } from '../storage/settings'

const logger = scopedLogger('images')

/**
 * LRU cache for generated thumbnails, keyed by path + mtime so edited files
 * re-generate. The cache lives in the main process as required by the
 * architecture; the renderer keeps only what it has already displayed.
 */
const thumbnailCache = new Map<string, ThumbnailData>()

/** Yields to the event loop so a batch of decodes/hashes cannot starve the UI. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

export function isSupportedImage(filePath: string): boolean {
  return (IMAGES.SUPPORTED_EXTENSIONS as ReadonlyArray<string>).includes(
    extname(filePath).toLowerCase(),
  )
}

export interface AddImagesResult {
  accepted: Array<ImportedImage>
  rejected: Array<RejectedFile>
  duplicates: number
}

/**
 * Validates, hashes, deduplicates (by content hash within the project), and
 * inserts files into the active project. Hashing streams per file with event
 * loop yields between files so large imports stay responsive.
 */
export async function addImagesToActiveProject(paths: Array<string>): Promise<AddImagesResult> {
  const db = getDb()
  const project = ensureActiveProject(db)
  const validated: Array<NewImageInput> = []
  const rejected: Array<RejectedFile> = []

  for (const filePath of paths) {
    if (!isSupportedImage(filePath)) {
      rejected.push({ path: filePath, reason: 'Unsupported file type (use JPG, PNG, or WEBP)' })
      continue
    }
    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        rejected.push({ path: filePath, reason: 'Not a file' })
        continue
      }
      if (stats.size > IMAGES.MAX_FILE_BYTES) {
        rejected.push({ path: filePath, reason: 'File is larger than 100 MB' })
        continue
      }
      const fileHash = await sha256File(filePath)
      validated.push({
        path: filePath,
        fileName: basename(filePath),
        sizeBytes: stats.size,
        lastModifiedMs: stats.mtimeMs,
        fileHash,
      })
      await yieldToEventLoop()
    } catch {
      rejected.push({ path: filePath, reason: 'File not found or not readable' })
    }
  }

  const hashes = validated
    .map((item) => item.fileHash)
    .filter((hash): hash is string => hash !== null)
  const existingHashes = findExistingHashes(db, project.id, hashes)
  const fresh = validated.filter(
    (item) => item.fileHash === null || !existingHashes.has(item.fileHash),
  )
  const duplicates = validated.length - fresh.length

  const accepted = insertImages(db, project.id, fresh)
  logger.info('Images added to project', {
    projectId: project.id,
    accepted: accepted.length,
    rejected: rejected.length,
    duplicates,
  })
  return { accepted, rejected, duplicates }
}

/** Opens a single-file dialog and re-points a missing image at the chosen file. */
export async function relinkImageFile(imageId: string): Promise<ImportedImage | null> {
  const db = getDb()
  const projectId = getImageProjectId(db, imageId)
  if (!projectId) throw new AppError('NOT_FOUND', 'This image no longer exists in the project.')

  const result = await dialog.showOpenDialog({
    title: 'Relink image',
    properties: ['openFile'],
    filters: [{ name: 'Images (JPG, PNG, WEBP)', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const newPath = result.filePaths[0]
  if (!newPath || !isSupportedImage(newPath)) {
    throw new AppError('VALIDATION', 'The selected file is not a supported image (JPG, PNG, WEBP).')
  }
  const stats = await fs.stat(newPath).catch(() => null)
  if (!stats) throw new AppError('NOT_FOUND', 'The selected file could not be read.')
  const fileHash = await sha256File(newPath)

  persistRelink(db, imageId, newPath, fileHash)
  logger.info('Image relinked', { imageId, newPath })
  return {
    id: imageId,
    projectId,
    path: newPath,
    fileName: basename(newPath),
    sizeBytes: stats.size,
    lastModifiedMs: stats.mtimeMs,
    missing: false,
    fileHash,
  }
}

function resizeToEdge(image: NativeImage, edge: number): NativeImage {
  const { width, height } = image.getSize()
  if (Math.max(width, height) <= edge) return image
  return width >= height ? image.resize({ width: edge }) : image.resize({ height: edge })
}

function evictCacheOverflow(): void {
  while (thumbnailCache.size > IMAGES.CACHE_MAX_ENTRIES) {
    const oldest = thumbnailCache.keys().next()
    if (oldest.done) break
    thumbnailCache.delete(oldest.value)
  }
}

export async function getImageThumbnail(filePath: string): Promise<ThumbnailData> {
  let mtimeMs: number
  try {
    mtimeMs = (await fs.stat(filePath)).mtimeMs
  } catch {
    throw new AppError('NOT_FOUND', 'The image file no longer exists.')
  }

  const cacheKey = `${filePath}|${mtimeMs}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) {
    // Refresh for LRU ordering.
    thumbnailCache.delete(cacheKey)
    thumbnailCache.set(cacheKey, cached)
    return cached
  }

  await yieldToEventLoop()
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) {
    throw new AppError(
      'INTERNAL',
      'The image could not be decoded. It may be corrupted or in an unsupported format.',
    )
  }
  const originalSize = image.getSize()
  const resized = resizeToEdge(image, IMAGES.THUMBNAIL_EDGE)
  const data: ThumbnailData = {
    dataUrl: `data:image/jpeg;base64,${resized.toJPEG(IMAGES.THUMBNAIL_JPEG_QUALITY).toString('base64')}`,
    width: originalSize.width,
    height: originalSize.height,
  }
  thumbnailCache.set(cacheKey, data)
  evictCacheOverflow()
  logger.debug('Thumbnail generated')
  return data
}

export function clearThumbnailCache(): number {
  const cleared = thumbnailCache.size
  thumbnailCache.clear()
  logger.info('Thumbnail cache cleared', { cleared })
  return cleared
}

export interface ModelImage {
  base64: string
  width: number
  height: number
}

/** Downscales an image (configured long edge, JPEG) before sending it to Gemini. */
export async function prepareImageForModel(filePath: string): Promise<ModelImage> {
  const stats = await fs.stat(filePath).catch(() => null)
  if (!stats) throw new AppError('NOT_FOUND', 'The image file no longer exists.')
  if (stats.size > IMAGES.MAX_FILE_BYTES) {
    throw new AppError('VALIDATION', 'The image is larger than 100 MB and cannot be processed.')
  }

  await yieldToEventLoop()
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) {
    throw new AppError(
      'INTERNAL',
      'The image could not be decoded. It may be corrupted or in an unsupported format.',
    )
  }
  const { modelImageEdge } = await getSettingsState()
  const size = image.getSize()
  const resized = resizeToEdge(image, modelImageEdge)
  return {
    base64: resized.toJPEG(GEMINI.MODEL_JPEG_QUALITY).toString('base64'),
    width: size.width,
    height: size.height,
  }
}
