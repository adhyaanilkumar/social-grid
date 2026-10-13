// Password field: the originui Input plus the Show/Hide toggle from 21st.dev "Password Input" (kokonutd/password-input).
// Kept from kokonutd: a real <button> with an accessible name. Not taken: its strength bar and
// uppercase/number/symbol rules (our backend only requires a length), its zinc colours and icon package.
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} spellCheck={false} className={cn('pr-10', className)} {...props} />
      {/* aria-pressed tells screen readers whether the password is currently shown. */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label="Show password"
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

export { PasswordInput }
