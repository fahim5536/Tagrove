import { create } from 'zustand'
import type { UpdaterEvent } from '@shared/ipc'

export type UpdaterStatus =
  'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdaterState {
  status: UpdaterStatus
  version: string | null
  percent: number
  error: string | null
  /** "Later" hides the downloaded banner until the next event. */
  dismissed: boolean
  applyUpdaterEvent: (event: UpdaterEvent) => void
  dismiss: () => void
}

export const useUpdaterStore = create<UpdaterState>()((set) => ({
  status: 'idle',
  version: null,
  percent: 0,
  error: null,
  dismissed: false,

  applyUpdaterEvent: (event) => {
    if (event.type === 'checking') {
      set({ status: 'checking', error: null, dismissed: false })
      return
    }
    if (event.type === 'available') {
      set({ status: 'available', version: event.version, error: null, dismissed: false })
      return
    }
    if (event.type === 'not-available') {
      set({ status: 'not-available', version: null, dismissed: false })
      return
    }
    if (event.type === 'downloading') {
      set({ status: 'downloading', percent: event.percent, dismissed: false })
      return
    }
    if (event.type === 'downloaded') {
      set({ status: 'downloaded', version: event.version, percent: 100, dismissed: false })
      return
    }
    set({ status: 'error', error: event.message })
  },

  dismiss: () => set({ dismissed: true }),
}))
