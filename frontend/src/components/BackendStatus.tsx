import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/api/client'

// Proves the browser can reach the backend through CORS. There is no public GET endpoint yet,
// so we call /api/auth/login without credentials: a 401 means "server reachable, not logged in".
// A CORS block or a stopped server makes fetch itself fail, which shows up as "unreachable".
async function checkBackend(): Promise<'reachable'> {
  try {
    await apiFetch('/api/auth/login')
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
  }
  return 'reachable'
}

export default function BackendStatus() {
  const { isPending, isError } = useQuery({
    queryKey: ['backend-status'],
    queryFn: checkBackend,
    retry: false,
  })

  const label = isPending ? 'Checking backend…' : isError ? 'Backend unreachable' : 'Backend connected'
  const dot = isPending ? 'bg-muted-foreground' : isError ? 'bg-destructive' : 'bg-green-600'

  return (
    <p role="status" data-testid="backend-status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </p>
  )
}
