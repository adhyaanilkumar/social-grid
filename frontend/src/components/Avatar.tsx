import { cn } from '@/lib/utils'

// The first letter of a username. Decorative, since the username is always shown beside it. Grey, because
// blue is kept for things you can act on, and this isn't one.
export default function Avatar({ username, className }: { username: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground uppercase',
        className,
      )}
    >
      {username[0]}
    </span>
  )
}
