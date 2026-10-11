import { Link } from 'react-router'

// Placeholder: the real login form is AD-245.
export default function Login() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">Log in</h1>
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
