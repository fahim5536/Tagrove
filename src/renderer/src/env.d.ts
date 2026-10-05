import type { TagroveApi } from '@shared/ipc'

declare global {
  interface Window {
    readonly api: TagroveApi
  }
}

export {}
