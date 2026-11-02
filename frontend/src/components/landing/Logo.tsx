import { LayoutGrid } from 'lucide-react'
import { Link } from 'react-router'

export default function Logo({ to = '/', onClick }: { to?: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <LayoutGrid className="size-6 text-primary" aria-hidden />
      social-grid
    </Link>
  )
}
