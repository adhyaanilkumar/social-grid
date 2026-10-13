// A small typed wrapper around fetch for talking to the Spring Boot backend.
// Every call goes through apiFetch so the base URL and error handling live in one place.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

// Mirrors com.socialgrid.dto.ErrorResponse on the backend.
export interface ErrorBody {
  status: number
  error: string
  message: string
  // Present when the error is about specific request fields, e.g. { username: 'Username already taken' }.
  fieldErrors?: Record<string, string>
}

// Thrown for any non-2xx response, so callers (and TanStack Query) see a normal rejected promise.
export class ApiError extends Error {
  readonly status: number
  readonly body: ErrorBody | null

  constructor(status: number, body: ErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    // Spring sends an ErrorResponse JSON body for handled errors; some (e.g. 401 from Security) have none.
    const errorBody = await response.json().catch(() => null)
    throw new ApiError(response.status, errorBody as ErrorBody | null)
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
