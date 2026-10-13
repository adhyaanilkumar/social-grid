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

export function register(request: RegisterRequest): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/auth/register', { method: 'POST', body: request })
}
