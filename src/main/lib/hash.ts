import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Streams a file through SHA-256 in chunks so even large images never pin
 * the main-process thread for a whole file at once.
 */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 })
    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('error', (error) => {
      stream.close()
      reject(error)
    })
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
  })
}
