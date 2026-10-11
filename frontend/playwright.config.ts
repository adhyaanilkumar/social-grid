import { defineConfig, devices } from '@playwright/test'

// UI tests run against the Vite dev server. Uses the locally installed Chrome (channel: 'chrome'),
// so no separate browser download is needed.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
})
