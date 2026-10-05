import { lazy, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import { updaterEventSchema } from '@shared/ipc'
import { AppShell } from './components/layout/AppShell'
import { LoaderIcon } from './components/icons'
import { UpdateBanner } from './components/updater/UpdateBanner'
import { ToastViewport } from './components/ui/Toast'
import { SETTINGS_CHANGED_EVENT } from './constants'
import { useNavigationStore } from './store/navigation.store'
import { useUpdaterStore } from './store/updater.store'
import type { PageId } from './constants'
import { GeneratePage } from './pages/GeneratePage'
import i18n from './i18n'
import type { AppearanceMode, SettingsState } from '@shared/types'

// Lazy-load the lighter pages; Generate (the landing page) stays eager.
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const AboutPageLazy = lazy(() =>
  import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })),
)

/** Applies the resolved theme to <html data-theme> (CSS tokens react to it). */
function applyTheme(mode: AppearanceMode): void {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  document.documentElement.dataset.theme = resolved
}

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <LoaderIcon className="size-6 animate-spin text-fg-subtle" />
    </div>
  )
}

export default function App() {
  const activePage = useNavigationStore((state) => state.activePage)
  const applyUpdaterEvent = useUpdaterStore((state) => state.applyUpdaterEvent)

  useEffect(() => {
    const apply = (state: SettingsState): void => {
      applyTheme(state.appearance)
      if (state.language !== i18n.language) {
        void i18n.changeLanguage(state.language)
      }
    }

    void window.api.settings.getState().then((result) => {
      if (result.ok) apply(result.data)
    })

    const onChanged = (event: Event): void => {
      const detail = (event as CustomEvent<SettingsState>).detail
      if (detail) apply(detail)
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChanged)

    // Follow OS theme changes while in "system" mode.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = (): void => {
      void window.api.settings.getState().then((result) => {
        if (result.ok && result.data.appearance === 'system') applyTheme('system')
      })
    }
    media.addEventListener('change', onSystemChange)

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onChanged)
      media.removeEventListener('change', onSystemChange)
    }
  }, [])

  // Update progress arrives as push events; validate every payload before use.
  useEffect(() => {
    const unsubscribe = window.api.updater.onEvent((event) => {
      const parsed = updaterEventSchema.safeParse(event)
      if (parsed.success) applyUpdaterEvent(parsed.data)
    })
    return unsubscribe
  }, [applyUpdaterEvent])

  const pages: Record<PageId, ReactNode> = {
    generate: <GeneratePage />,
    history: (
      <Suspense fallback={<PageLoader />}>
        <HistoryPage />
      </Suspense>
    ),
    settings: (
      <Suspense fallback={<PageLoader />}>
        <SettingsPage />
      </Suspense>
    ),
    about: (
      <Suspense fallback={<PageLoader />}>
        <AboutPageLazy />
      </Suspense>
    ),
  }

  return (
    <>
      <UpdateBanner />
      <AppShell>{pages[activePage]}</AppShell>
      <ToastViewport />
    </>
  )
}
