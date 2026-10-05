import { cn } from '@renderer/lib/utils'

export interface ProgressBarProps {
  /** 0–100. Ignored when indeterminate. */
  value?: number
  indeterminate?: boolean
  label?: string
  className?: string
}

export function ProgressBar({
  value = 0,
  indeterminate = false,
  label,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
          <span>{label}</span>
          {!indeterminate ? <span className="font-mono">{Math.round(clamped)}%</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {indeterminate ? (
          <div className="absolute inset-y-0 left-0 w-2/5 animate-progress-indeterminate rounded-full bg-accent" />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  )
}
