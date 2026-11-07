// Hint and error ids for aria-describedby, so screen readers read them along with the label.
export function describedBy(id: string, hasHint: boolean, error: string | undefined) {
  return [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}
