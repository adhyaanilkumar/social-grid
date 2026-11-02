import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ApiError } from './api/client'
import App from './App.tsx'
import AuthProvider from './auth/AuthProvider'
import { expireSession } from './auth/session'
import './index.css'

function handleSessionEnd(error: Error) {
  if (error instanceof ApiError && error.status === 401) expireSession(queryClient)
}

// One cache for all server data (posts, profiles, ...) shared by every component.
const queryClient = new QueryClient({
  // These run for every failed request, wherever it came from, so an expired session always ends at the login page.
  queryCache: new QueryCache({ onError: handleSessionEnd }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // A 401 from the login form means a wrong password, not an expired session.
      if (!mutation.meta?.ignoreSessionEnd) handleSessionEnd(error)
    },
  }),
  defaultOptions: {
    queries: {
      // Retrying can fix a network blip or a server error. A 4xx will fail the same way again, and retrying a
      // 401 would delay the redirect to login by about 7 seconds.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": animations are skipped for visitors whose OS asks for reduced motion. */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        {/* Inside the query client: it caches the "who is logged in" answer there. */}
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
