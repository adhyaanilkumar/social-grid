import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { searchUsers } from '@/api/users'
import SearchBar from '@/components/app/SearchBar'
import Avatar from '@/components/Avatar'
import { Button } from '@/components/ui/button'

// The backend returns at most this many, with no total.
const RESULT_LIMIT = 20

export default function Search() {
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim()

  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchUsers(query),
    enabled: query !== '',
  })
  const users = results.data ?? []

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 pt-4 min-[480px]:px-0 md:gap-6 md:pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      {/* The desktop box lives in the top bar. On a phone, this page is where you search from. */}
      <SearchBar autoFocus={!query} className="md:hidden" />

      {!query && <p className="text-sm text-muted-foreground">Find people by their username.</p>}

      {query && results.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Searching…
        </p>
      )}

      {results.isError && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm">
            Couldn't search. Check your connection and try again.
          </p>
          <Button variant="outline" className="h-11 px-3" onClick={() => results.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {results.isSuccess && (
        <>
          <div role="status" className="flex min-w-0 flex-col gap-1 text-sm">
            {users.length === 0 ? (
              // The query is shown in full, so a long one with no spaces must be allowed to break anywhere (NFR6).
              <p className="wrap-anywhere">No users match &ldquo;{query}&rdquo;. Check the spelling or try part of the name.</p>
            ) : (
              <p className="text-muted-foreground">
                {users.length === RESULT_LIMIT
                  ? `Showing the first ${RESULT_LIMIT}. Try a longer username.`
                  : `${users.length} ${users.length === 1 ? 'user' : 'users'} found`}
              </p>
            )}
            {/* Searching your own name finds nothing, which would otherwise look broken. */}
            <p className="text-muted-foreground">Your own profile isn't shown.</p>
          </div>

          {users.length === 0 && (
            <Link to="/explore" className="text-sm font-medium text-primary underline underline-offset-4">
              Go to Explore
            </Link>
          )}

          <ul className="flex flex-col">
            {users.map((user) => (
              <li key={user.id}>
                <Link
                  to={`/users/${encodeURIComponent(user.username)}`}
                  className="flex min-h-12 items-center gap-2 rounded-lg text-sm font-semibold hover:underline"
                >
                  <Avatar username={user.username} />
                  <span className="min-w-0 truncate">{user.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
