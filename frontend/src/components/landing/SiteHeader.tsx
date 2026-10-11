// Adapted from 21st.dev "Classic Header with Sheet Menu" (ln-dev7/header-17).
// Changes: our logo and in-page links, Log in / Sign up routed with React Router, theme toggle added.
import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import Logo from '@/components/landing/Logo'
import ThemeToggle from '@/components/landing/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Example posts', href: '#posts' },
]

export default function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button asChild variant="ghost" size="lg" className="px-4">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild size="lg" className="px-4">
            <Link to="/register">Sign up</Link>
          </Button>
        </div>

        {/* Below md the nav and buttons move into a slide-out sheet. */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6">
              <SheetHeader className="p-0">
                <SheetTitle asChild>
                  <div>
                    <Logo onClick={() => setOpen(false)} />
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t border-border pt-6">
                <Button asChild variant="outline" size="lg">
                  <Link to="/login">Log in</Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="/register">Sign up</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
