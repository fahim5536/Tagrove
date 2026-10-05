import { useTranslation } from 'react-i18next'
import { Modal } from '../ui/Modal'

const SHORTCUTS: Array<{ keys: string; key: string }> = [
  { keys: 'Ctrl+Enter', key: 'shortcuts.generateAll' },
  { keys: 'Ctrl+E', key: 'shortcuts.export' },
  { keys: 'Ctrl+F', key: 'shortcuts.search' },
  { keys: 'Ctrl+Z', key: 'shortcuts.undo' },
  { keys: 'Enter', key: 'shortcuts.commit' },
  { keys: '?', key: 'shortcuts.shortcutsDialog' },
  { keys: 'Esc', key: 'shortcuts.close' },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={t('shortcuts.title')} onClose={onClose}>
      <dl className="space-y-2">
        {SHORTCUTS.map(({ keys, key }) => (
          <div
            key={keys}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-base px-3 py-2"
          >
            <dt className="text-sm text-fg-muted">{t(key)}</dt>
            <dd>
              <kbd className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-fg">
                {keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
