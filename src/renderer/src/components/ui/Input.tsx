import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: ReactNode
  error?: string
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-9 w-full rounded-md border bg-base px-3 text-sm text-fg transition-colors',
          'placeholder:text-fg-subtle focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/60'
            : 'border-border focus:border-accent focus:ring-accent/60',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
