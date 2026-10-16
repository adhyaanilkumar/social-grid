import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context'

// Wraps members-only routes. Logged-out visitors go to /login, carrying the page they wanted in
// `from` so the login page can send them back there afterwards.
export default function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Checking your session…
        </p>
      </main>
    )
  }

  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location }} />

  return <Outlet />
}
