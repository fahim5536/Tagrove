import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export interface TableColumn<Row> {
  key: string
  header: ReactNode
  render?: (row: Row) => ReactNode
  className?: string
}

export interface TableProps<Row> {
  columns: Array<TableColumn<Row>>
  rows: Array<Row>
  getRowKey: (row: Row) => string
  /** Rendered inside the table body when rows is empty. */
  emptyState?: ReactNode
}

export function Table<Row>({ columns, rows, getRowKey, emptyState }: TableProps<Row>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 text-left text-xs font-medium text-fg-muted',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-fg-subtle"
              >
                {emptyState ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-surface-2/50"
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3 text-fg', column.className)}>
                    {column.render
                      ? column.render(row)
                      : String(row[column.key as keyof Row] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
