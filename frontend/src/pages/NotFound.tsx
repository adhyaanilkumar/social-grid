import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  )
}
