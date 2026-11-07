// Adapted from 21st.dev "Dialog" (originui/dialog). Radix handles Escape and focus trapping; returning focus is ours.
// Changes: plain function components, our radix-ui and lucide-react packages instead of its two extras,
// fades only (no zoom or slide), a 44px close button, and full screen below the md breakpoint.
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, type ComponentProps, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  // Radix only returns focus to a DialogTrigger, and ours are opened from state (a nav button, a grid tile), so
  // remember whatever had focus when the dialog opened and put focus back there on close. If that element has
  // gone (a deleted post's tile), focus is left to the browser.
  const opener = useRef<HTMLElement | null>(null)

  function handleOpenAutoFocus(event: Event) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
    onOpenAutoFocus?.(event)
  }

  function handleCloseAutoFocus(event: Event) {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    const target = opener.current
    opener.current = null
    if (target?.isConnected) {
      event.preventDefault()
      target.focus()
    }
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100svh-4rem)] md:w-full md:max-w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[14px] md:border md:p-6 md:shadow-lg',
          className,
        )}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground md:top-2 md:right-2">
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pr-10', className)} {...props} />
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle }
