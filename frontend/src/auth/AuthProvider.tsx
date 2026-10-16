import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import { AuthContext, type AuthState } from './auth-context'

const ME = ['me']

// A 401 isn't a failure here, it's the answer "nobody is logged in".
async function fetchMe(): Promise<authApi.UserResponse | null> {
  try {
    return await authApi.me()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

// React state is wiped on every page refresh, but the session cookie isn't. So on load we ask the backend
// who the cookie belongs to, and keep the answer in the query cache for every component to read.
export default function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ME,
    queryFn: fetchMe,
    retry: false,
    // Only login and logout change the answer, and they update the cache themselves.
    staleTime: Infinity,
  })

  const user = data ?? null
  const value: AuthState = {
    user,
    // A failed check (backend down) counts as logged out; the login page then reports the real problem.
    status: isPending ? 'loading' : user ? 'authed' : 'anon',
    login: async (request) => {
      const loggedIn = await authApi.login(request)
      queryClient.setQueryData(ME, loggedIn)
      return loggedIn
    },
    logout: async () => {
      await authApi.logout()
      queryClient.setQueryData(ME, null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
