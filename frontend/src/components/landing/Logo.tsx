import { LayoutGrid } from 'lucide-react'
import { Link } from 'react-router'

export default function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <LayoutGrid className="size-6 text-primary" aria-hidden />
      social-grid
    </Link>
  )
}
