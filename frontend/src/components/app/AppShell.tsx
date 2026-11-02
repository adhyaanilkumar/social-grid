import { Compass, Home, LoaderCircle, PlusSquare, Search, User, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/auth-context'
import { ComposerContext } from '@/components/app/composer-context'
import SearchBar from '@/components/app/SearchBar'
import Logo from '@/components/landing/Logo'
import PostComposer from '@/components/post/PostComposer'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Links rather than ARIA tabs, because each one is a separate page. NavLink sets aria-current="page" itself.
// The current page is shown by weight and an underline as well as colour.
function TopLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-14 max-w-40 items-center truncate border-b-2 border-transparent px-2 text-sm transition-colors duration-150 hover:text-foreground',
          isActive ? 'border-primary font-semibold text-primary' : 'text-muted-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}

const bottomItem = 'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors duration-150'

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(bottomItem, isActive ? 'font-semibold text-primary' : 'text-muted-foreground')}
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5', isActive && 'fill-primary/20')} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [composerOpen, setComposerOpen] = useState(false)
  // The page the "Posted" note appeared on, since it only makes sense there.
  const [postedOn, setPostedOn] = useState<string>()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string>()

  const username = user?.username ?? ''
  const profilePath = `/users/${encodeURIComponent(username)}`

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(undefined)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError("Couldn't log out. Check your connection and try again.")
      setLoggingOut(false)
    }
  }

  function handlePosted() {
    setComposerOpen(false)
    // The new post is at the top of a feed. Anywhere else it isn't visible, so say where it went.
    if (location.pathname === '/home' || location.pathname === '/explore') window.scrollTo(0, 0)
    else setPostedOn(location.pathname)
  }

  return (
    <ComposerContext.Provider value={() => setComposerOpen(true)}>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-2 px-4 md:h-14 md:gap-4">
          <Logo to="/home" />
          <nav aria-label="Main" className="hidden items-center gap-2 md:flex">
            <TopLink to="/home">Home</TopLink>
            <TopLink to="/explore">Explore</TopLink>
          </nav>
          <SearchBar className="hidden max-w-xs flex-1 md:flex" />
          <div className="flex items-center gap-1 md:gap-2">
            <Button className="hidden h-10 px-3 md:inline-flex" onClick={() => setComposerOpen(true)}>
              <PlusSquare aria-hidden />
              New post
            </Button>
            <div className="hidden md:block">
              <TopLink to={profilePath}>{username}</TopLink>
            </div>
            <ThemeToggle />
            <Button variant="outline" size="lg" className="px-3" onClick={handleLogout} aria-disabled={loggingOut}>
              {loggingOut && <LoaderCircle className="animate-spin" aria-hidden />}
              {loggingOut ? 'Logging out…' : 'Log out'}
            </Button>
          </div>
        </div>
      </header>

      {logoutError && (
        <p role="alert" className="mx-auto max-w-6xl px-4 pt-4 text-sm text-destructive">
          {logoutError}
        </p>
      )}
      {postedOn === location.pathname && (
        <p role="status" className="mx-auto max-w-6xl px-4 pt-4 text-sm">
          Posted.{' '}
          <Link to={profilePath} className="font-medium text-primary underline underline-offset-4">
            See it on your profile
          </Link>
        </p>
      )}

      {/* The bottom padding keeps the last post clear of the mobile bottom bar. */}
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-16">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <BottomLink to="/home" label="Home" icon={Home} />
        <BottomLink to="/explore" label="Explore" icon={Compass} />
        <BottomLink to="/search" label="Search" icon={Search} />
        <button type="button" onClick={() => setComposerOpen(true)} className={cn(bottomItem, 'text-muted-foreground')}>
          <PlusSquare className="size-5" aria-hidden />
          New post
        </button>
        <BottomLink to={profilePath} label="Profile" icon={User} />
      </nav>

      <PostComposer open={composerOpen} onOpenChange={setComposerOpen} onPosted={handlePosted} />
    </ComposerContext.Provider>
  )
}
