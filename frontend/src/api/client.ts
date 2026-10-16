// A small typed wrapper around fetch for talking to the Spring Boot backend.
// Every call goes through apiFetch so the base URL, CSRF header and error handling live in one place.

// Empty by default: calls go to /api on the page's own origin, and Vite or nginx forwards them to Spring.
const API_URL = import.meta.env.VITE_API_URL ?? ''

// Spring puts the CSRF token in this readable cookie; we echo it back in a header on requests that change
// data. Another site can make the browser send our cookies, but it can't read them to copy into the header.
function csrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

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
  const token = method === 'GET' ? undefined : csrfToken()

  const response = await fetch(`${API_URL}${path}`, {
    method,
    // Send the session cookie (JSESSIONID) with the request.
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { 'X-XSRF-TOKEN': token }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    // Spring sends an ErrorResponse JSON body for errors; a proxy failure (backend down) may send none.
    const errorBody = await response.json().catch(() => null)
    throw new ApiError(response.status, errorBody as ErrorBody | null)
  }

  // Some successes have no body to parse: 204 No Content (e.g. DELETE), or logout's empty 200.
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
