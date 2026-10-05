import { create } from 'zustand'
import { MAX_TOASTS } from '../constants'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  description?: string
}

interface UiState {
  toasts: Array<ToastItem>
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (id: string) => void
}

let toastCounter = 0

export const useUiStore = create<UiState>()((set) => ({
  toasts: [],
  pushToast: (toast) =>
    set((state) => {
      toastCounter += 1
      const next = [...state.toasts, { ...toast, id: `toast-${toastCounter}` }]
      return { toasts: next.slice(-MAX_TOASTS) }
    }),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
