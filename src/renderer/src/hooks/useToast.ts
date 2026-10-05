import { useMemo } from 'react'
import { useUiStore } from '../store/ui.store'

export interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

/** Convenience wrapper: toast.success(title, description?). Auto-dismiss happens in the viewport. */
export function useToast(): ToastApi {
  const pushToast = useUiStore((state) => state.pushToast)
  return useMemo(
    () => ({
      success: (title, description) => pushToast({ variant: 'success', title, description }),
      error: (title, description) => pushToast({ variant: 'error', title, description }),
      info: (title, description) => pushToast({ variant: 'info', title, description }),
      warning: (title, description) => pushToast({ variant: 'warning', title, description }),
    }),
    [pushToast],
  )
}
