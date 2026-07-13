import { defineConfig, devices } from '@playwright/test';

// Runs the Vite dev server in E2E mode (VITE_E2E=1 → fake auth, role from ?e2e=<role>).
// API calls are same-origin (VITE_API_URL='') so tests intercept /v1/* with fixtures.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: { VITE_E2E: '1', VITE_API_URL: '' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
