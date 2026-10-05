import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUiStore } from './store/ui.store'
import './i18n'
import './assets/main.css'

function reportGlobalError(message: string, stack?: string | null): void {
  useUiStore
    .getState()
    .pushToast({ variant: 'error', title: 'Unexpected error', description: message })
  void window.api?.log
    .write({ level: 'error', message, context: { stack: stack ?? null } })
    .catch(() => {
      // The bridge is unavailable; the toast above is all we can show.
    })
}

window.addEventListener('error', (event) => {
  reportGlobalError(
    `Uncaught error: ${event.message}`,
    event.error instanceof Error ? event.error.stack : null,
  )
})

window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason
  reportGlobalError(
    reason instanceof Error
      ? `Unhandled rejection: ${reason.message}`
      : `Unhandled rejection: ${String(reason)}`,
    reason instanceof Error ? reason.stack : null,
  )
})

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
