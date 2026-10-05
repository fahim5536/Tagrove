import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import defaultBannedWords from '@shared/bannedWords.json'
import defaultCategories from '@shared/categories.json'
import type { Category } from '@shared/types'
import { scopedLogger } from '../services/logger'

/**
 * Editable configuration lists. categories.json and bannedWords.json live in
 * src/shared (dev) and are packaged into resources/shared-config; they are
 * re-read from disk on startup so the lists can be tuned without touching
 * code. If the on-disk file is missing or invalid, the bundled defaults are
 * used and the problem is logged.
 */
const logger = scopedLogger('config')

const categoryListFileSchema = z.object({
  note: z.string().optional(),
  categories: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
    .min(1, 'The category list must not be empty'),
})

const bannedWordsFileSchema = z.object({
  note: z.string().optional(),
  words: z.array(z.string().min(1)),
})

function listsDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'shared-config')
    : resolve(__dirname, '..', '..', 'src', 'shared')
}

function readListFile(fileName: string): unknown {
  const filePath = join(listsDirectory(), fileName)
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

let categoriesCache: Array<Category> | null = null

export function loadCategories(): Array<Category> {
  if (categoriesCache) return categoriesCache
  const fallback = categoryListFileSchema.parse(defaultCategories).categories
  try {
    const parsed = categoryListFileSchema.parse(readListFile('categories.json'))
    categoriesCache = parsed.categories
    logger.info('Categories loaded from disk', { count: categoriesCache.length })
  } catch (error) {
    logger.warn('Could not load categories.json from disk; using bundled defaults', {
      message: error instanceof Error ? error.message : String(error),
    })
    categoriesCache = fallback
  }
  return categoriesCache
}

let bannedWordsCache: Array<string> | null = null

export function loadBannedWords(): Array<string> {
  if (bannedWordsCache) return bannedWordsCache
  const fallback = bannedWordsFileSchema.parse(defaultBannedWords).words
  try {
    const parsed = bannedWordsFileSchema.parse(readListFile('bannedWords.json'))
    bannedWordsCache = parsed.words
    logger.info('Banned words loaded from disk', { count: bannedWordsCache.length })
  } catch (error) {
    logger.warn('Could not load bannedWords.json from disk; using bundled defaults', {
      message: error instanceof Error ? error.message : String(error),
    })
    bannedWordsCache = fallback
  }
  return bannedWordsCache
}
