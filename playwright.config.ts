import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173/tod/'
const serverCommand = process.env.E2E_SERVER_COMMAND ?? 'npm run dev -- --host 127.0.0.1 --port 4173'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: process.env.E2E_PWA === 'true' ? [] : '**/pwa.spec.ts',
  outputDir: '/tmp/truth-or-dare-playwright',
  reporter: 'line',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: false,
  },
})
