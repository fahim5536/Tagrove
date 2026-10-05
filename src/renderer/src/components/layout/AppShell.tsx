import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PAGE_META } from '@renderer/constants'
import { useNavigationStore } from '@renderer/store/navigation.store'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const activePage = useNavigationStore((state) => state.activePage)
  const meta = PAGE_META[activePage]

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <div>
            <h1 className="text-sm font-semibold text-fg">{t(meta.titleKey)}</h1>
            <p className="text-xs text-fg-muted">{t(meta.descriptionKey)}</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
