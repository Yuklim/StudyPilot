import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const backendRoot = fileURLToPath(new URL('../backend', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:15173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '.venv/bin/python tests/run_browser_server.py',
      cwd: backendRoot,
      url: 'http://127.0.0.1:18000/health',
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'npm run dev -- --config e2e/vite.config.ts',
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
})
