// Adapted from 21st.dev "Textarea" (originui/textarea).
// Changes: plain function component (React 19 passes ref as a prop), and the same text size, placeholder
// contrast and shared focus style as our Input.
import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm shadow-black/5 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'aria-invalid:border-destructive/80',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
