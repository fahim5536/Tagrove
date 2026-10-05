import { AlertIcon } from './icons'
import { Button } from './ui/Button'

export interface ErrorScreenProps {
  error: Error
}

/** Full-screen fallback for unrecoverable renderer errors. */
export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="flex h-full items-center justify-center bg-base p-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-8">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-danger/15 text-danger">
          <AlertIcon className="size-5" />
        </div>
        <h1 className="text-base font-semibold text-fg">Something went wrong</h1>
        <p className="mt-1 text-sm text-fg-muted">
          An unexpected error occurred. Details were written to the log file.
        </p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-border bg-base p-3 font-mono text-xs whitespace-pre-wrap text-fg-muted">
          {error.message}
        </pre>
        <div className="mt-5">
          <Button onClick={() => window.location.reload()}>Reload app</Button>
        </div>
      </div>
    </div>
  )
}
