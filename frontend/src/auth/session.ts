import type { QueryClient } from '@tanstack/react-query'

export const ME = ['me']
export const SESSION_EXPIRED = ['session-expired']

// Removes every cached query except "who am I", then marks nobody as logged in, so the next person to log in
// on this browser can't see the previous user's data. The order matters: AuthProvider is subscribed to ME, so
// ME has to stay in the cache. queryClient.clear() would remove it, and AuthProvider wouldn't hear the update.
export function clearSession(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME[0] })
  queryClient.setQueryData(ME, null)
}

// A request got 401, so the session has ended (for example, the backend restarted). RequireAuth then redirects
// to login, and the login page explains why. Ignored if nobody was logged in, such as a request still in flight
// when the user logged out.
export function expireSession(queryClient: QueryClient) {
  if (!queryClient.getQueryData(ME)) return
  clearSession(queryClient)
  queryClient.setQueryData(SESSION_EXPIRED, true)
}
