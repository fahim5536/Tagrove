import { AUTOSAVE_DEBOUNCE_MS } from '../constants'

type SavePatch = { title: string; keywords: Array<string>; categoryId: string | null }

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPatches = new Map<string, SavePatch>()

function apiAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.api !== 'undefined'
}

/**
 * Debounced autosave: collapses rapid edits (every keystroke) into one
 * `projects:save-metadata` call per row. The patch is resolved when the timer
 * fires so the latest state is always what lands in the database.
 */
export function scheduleMetadataSave(imageId: string, getPatch: () => SavePatch): void {
  if (!apiAvailable()) return
  pendingPatches.set(imageId, getPatch())
  const existing = timers.get(imageId)
  if (existing) clearTimeout(existing)
  timers.set(
    imageId,
    setTimeout(() => {
      timers.delete(imageId)
      const patch = pendingPatches.get(imageId)
      pendingPatches.delete(imageId)
      if (!patch) return
      void window.api.projects.saveMetadata({ imageId, patch }).catch(() => {
        // Surfaced through the log; the next edit retries the save.
      })
    }, AUTOSAVE_DEBOUNCE_MS),
  )
}

/**
 * Saves any pending patch for the given rows immediately and cancels their
 * timers. Used before a generation run so queued edits cannot land after the
 * AI result overwrites them.
 */
export function flushMetadataSaves(imageIds: Array<string>): void {
  for (const imageId of imageIds) {
    const timer = timers.get(imageId)
    if (!timer) continue
    clearTimeout(timer)
    timers.delete(imageId)
    const patch = pendingPatches.get(imageId)
    pendingPatches.delete(imageId)
    if (patch && apiAvailable()) {
      void window.api.projects.saveMetadata({ imageId, patch }).catch(() => {})
    }
  }
}

export function pendingSaveCountForTests(): number {
  return timers.size
}
