import { Link } from 'react-router'

// Placeholder: the real register form is AD-244.
export default function Register() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">Create account</h1>
      <p className="text-muted-foreground">The sign-up form is coming soon.</p>
      <Link to="/login" className="text-sm underline underline-offset-4">
        Already have an account? Log in
      </Link>
      <Link to="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  )
}
