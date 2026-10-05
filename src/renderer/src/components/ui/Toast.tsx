import { useEffect } from 'react'
import { cn } from '@renderer/lib/utils'
import { TOAST_DURATION_MS } from '../../constants'
import { useUiStore } from '../../store/ui.store'
import type { ToastItem, ToastVariant } from '../../store/ui.store'
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from '../icons'

const VARIANT_ICON: Record<ToastVariant, { Icon: typeof InfoIcon; className: string }> = {
  success: { Icon: CheckIcon, className: 'text-success' },
  error: { Icon: AlertIcon, className: 'text-danger' },
  info: { Icon: InfoIcon, className: 'text-info' },
  warning: { Icon: AlertIcon, className: 'text-warning' },
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismissToast = useUiStore((state) => state.dismissToast)

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, dismissToast])

  const { Icon, className } = VARIANT_ICON[toast.variant]
  return (
    <div
      role="status"
      className="flex w-80 animate-toast-in items-start gap-3 rounded-lg border border-border bg-surface p-3 shadow-xl"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs text-fg-muted">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-md p-0.5 text-fg-subtle transition-colors hover:text-fg"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastCard toast={toast} />
        </div>
      ))}
    </div>
  )
}
