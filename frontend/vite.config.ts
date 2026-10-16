import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// changeOrigin: false keeps the browser's Host header (e.g. localhost:5174). Spring then sees the request's
// Origin and Host match, so it's same-origin and CORS doesn't apply. Vite's string shorthand would rewrite Host
// to localhost:8080, making every POST look cross-site and get 403 "Invalid CORS request" (found in AD-246).
const API_PROXY = { target: 'http://localhost:8080', changeOrigin: false }

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // React Compiler memoizes components automatically, so we rarely need useMemo/useCallback.
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    // "@/components/ui/button" resolves to src/components/ui/button; shadcn and 21st.dev code import this way.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // The browser only ever talks to the Vite server; /api calls are forwarded to Spring Boot. Same origin
  // means the session cookie is sent without any CORS setup (nginx does the same job in Docker).
  server: { proxy: { '/api': API_PROXY } },
  preview: { proxy: { '/api': API_PROXY } },
})
