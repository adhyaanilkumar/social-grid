import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import AuthProvider from './auth/AuthProvider'
import { getTheme, setTheme } from './lib/theme'
import './index.css'

// Apply the saved theme before the first render so the page doesn't flash light-then-dark.
setTheme(getTheme())

// One cache for all server data (posts, profiles, ...) shared by every component.
const queryClient = new QueryClient()

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
