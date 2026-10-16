import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

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
  server: { proxy: { '/api': 'http://localhost:8080' } },
  preview: { proxy: { '/api': 'http://localhost:8080' } },
})
