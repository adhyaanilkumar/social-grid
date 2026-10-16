import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

// Shared by the register and login forms.

// Hint and error ids for aria-describedby, so screen readers read them along with the label.
export function describedBy(id: string, hasHint: boolean, error: string | undefined) {
  return [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}

// Label above, hint under the label (or under the input when hintBelow), error under the input.
export function Field({
  id,
  label,
  hint,
  hintBelow = false,
  error,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  hintBelow?: boolean
  error?: string
  children: ReactNode
}) {
  const hintEl = hint && (
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">
      {hint}
    </p>
  )
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {!hintBelow && hintEl}
      {children}
      {hintBelow && hintEl}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
