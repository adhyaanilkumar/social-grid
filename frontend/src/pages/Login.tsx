import { Link, useLocation } from 'react-router'

// Set by the register page after a successful sign-up (AD-263).
interface LoginState {
  registered?: boolean
  username?: string
}

// Placeholder: the real login form is AD-245.
export default function Login() {
  const state = useLocation().state as LoginState | null

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">Log in</h1>
      {state?.registered && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          Account created{state.username && <> for <strong>{state.username}</strong></>} — log in to continue.
        </p>
      )}
      <p className="text-muted-foreground">The login form is coming soon.</p>
      <Link to="/register" className="text-sm underline underline-offset-4">
        New here? Create an account
      </Link>
      <Link to="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  )
}
