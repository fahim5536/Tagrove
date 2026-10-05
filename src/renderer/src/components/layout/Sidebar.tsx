import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { ROADMAP } from '@renderer/constants'
import type { PageId } from '@renderer/constants'
import { useAppInfo } from '@renderer/hooks/useAppInfo'
import { cn } from '@renderer/lib/utils'
import { useNavigationStore } from '@renderer/store/navigation.store'
import { HistoryIcon, InfoIcon, LogoMark, SettingsIcon, SparklesIcon } from '../icons'
import type { IconProps } from '../icons'

interface NavItem {
  id: PageId
  labelKey: string
  Icon: ComponentType<IconProps>
}

const NAV_ITEMS: Array<NavItem> = [
  { id: 'generate', labelKey: 'nav.generate', Icon: SparklesIcon },
  { id: 'history', labelKey: 'nav.history', Icon: HistoryIcon },
  { id: 'settings', labelKey: 'nav.settings', Icon: SettingsIcon },
  { id: 'about', labelKey: 'nav.about', Icon: InfoIcon },
]

export function Sidebar() {
  const { t } = useTranslation()
  const activePage = useNavigationStore((state) => state.activePage)
  const navigate = useNavigationStore((state) => state.navigate)
  const { appInfo } = useAppInfo()

  return (
    <nav
      aria-label="Main navigation"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <LogoMark className="size-5 text-accent" />
        <span className="text-sm font-semibold tracking-tight text-fg">{t('app.name')}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
          const active = id === activePage
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent-soft font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-fg-subtle')} />
              {t(labelKey)}
            </button>
          )
        })}
      </div>
      <div className="mt-auto border-t border-border p-3">
        <p className="font-mono text-xs text-fg-subtle">
          {appInfo ? `v${appInfo.appVersion}` : 'v—'} · Phase {ROADMAP.CURRENT_PHASE}
        </p>
      </div>
    </nav>
  )
}
