import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Reads a JSON file, returning the fallback when the file does not exist.
 * Parse failures are re-thrown so callers can decide how to recover.
 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

/** Writes JSON atomically: content lands via a temp file and a rename. */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp`
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, filePath)
}
