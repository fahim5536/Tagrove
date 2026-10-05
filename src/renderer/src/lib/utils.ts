/** Joins truthy class names; the small stand-in for the classnames pattern. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString()
}
