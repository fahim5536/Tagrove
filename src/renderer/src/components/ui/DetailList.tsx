export interface DetailItem {
  label: string
  value: string
}

/** Label/value rows used on the Settings and About pages for paths and versions. */
export function DetailList({ items }: { items: Array<DetailItem> }) {
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border bg-base px-4 py-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 py-1.5">
          <span className="shrink-0 text-xs text-fg-muted">{item.label}</span>
          <span className="truncate font-mono text-xs text-fg" title={item.value}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
