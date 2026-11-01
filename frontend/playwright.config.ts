import { defineConfig, devices } from '@playwright/test'

// UI tests run against the Vite dev server. Uses the locally installed Chrome (channel: 'chrome'),
// so no separate browser download is needed.
// E2E_BASE_URL=http://localhost:5173 runs them against the Docker app (nginx) instead; then no dev server starts.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5174'

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx vite --port 5174 --strictPort',
        url: 'http://localhost:5174',
        reuseExistingServer: true,
      },
})
