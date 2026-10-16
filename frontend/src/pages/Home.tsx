import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/auth-context'
import Logo from '@/components/landing/Logo'
import { Button } from '@/components/ui/button'

// Members-only placeholder (AD-264): proves the login, session and route guard work end to end.
// A later feed/profile ticket replaces the body.
export default function Home() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string>()

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setError(undefined)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setError("Couldn't log out. Check your connection and try again.")
      setLoggingOut(false)
    }
  }

  return (
    <>
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Logo />
          <Button variant="outline" size="lg" className="px-4" onClick={handleLogout} aria-disabled={loggingOut}>
            {loggingOut && <LoaderCircle className="animate-spin" aria-hidden />}
            {loggingOut ? 'Logging out…' : 'Log out'}
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-16 md:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user?.username}</h1>
        <p className="text-muted-foreground">You're logged in. Your feed will appear here.</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </main>
    </>
  )
}
