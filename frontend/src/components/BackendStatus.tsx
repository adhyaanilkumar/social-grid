import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/api/client'

// Proves the browser can reach the backend. There is no public GET endpoint, so we ask /api/auth/me:
// 200 (logged in) or 401 (logged out) both mean "server reachable". With the backend stopped the proxy
// answers 502/504 (or fetch fails outright), which shows up as "unreachable".
async function checkBackend(): Promise<'reachable'> {
  try {
    await apiFetch('/api/auth/me')
  } catch (e) {
    if (!(e instanceof ApiError) || e.status >= 500) throw e
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
