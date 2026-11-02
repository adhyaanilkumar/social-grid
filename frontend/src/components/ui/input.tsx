// Adapted from 21st.dev "Input" (originui/input, demo "Input with error").
// Changes: plain function component (React 19 passes ref as a prop), taller h-10 for touch,
// and the demo's error styling applied automatically whenever aria-invalid is set.
import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm shadow-black/5 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'aria-invalid:border-destructive/80',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
