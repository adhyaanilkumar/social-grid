import { apiFetch } from './client'

// Mirror com.socialgrid.dto.RegisterRequest / UserResponse on the backend.
export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface UserResponse {
  id: number
  username: string
  email: string
}

export interface LoginRequest {
  // A username or an email address; the backend tries both.
  identifier: string
  password: string
}

export function register(request: RegisterRequest): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/auth/register', { method: 'POST', body: request })
}

// On success the backend sets the JSESSIONID session cookie; the browser sends it from then on.
export function login(request: LoginRequest): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/auth/login', { method: 'POST', body: request })
}

// Who is logged in, according to the session cookie. Rejects with a 401 ApiError when nobody is.
export function me(): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/auth/me')
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' })
}
