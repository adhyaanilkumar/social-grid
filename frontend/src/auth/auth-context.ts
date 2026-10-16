import { createContext, useContext } from 'react'
import type { LoginRequest, UserResponse } from '@/api/auth'

// 'loading' = we haven't heard back from /api/auth/me yet, so we don't know who is logged in.
// Pages must wait for it to settle, or a logged-in user would flash to /login on every refresh.
export type AuthStatus = 'loading' | 'authed' | 'anon'

export interface AuthState {
  user: UserResponse | null
  status: AuthStatus
  login: (request: LoginRequest) => Promise<UserResponse>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
