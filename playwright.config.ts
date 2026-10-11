import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const worker = process.env.E2E_SERVER === 'worker';
export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://localhost:5173`,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    env: { VITE_SUPABASE_URL: 'https://yoru-auth-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' },
    command: worker ? 'npm run build && npx wrangler dev --local --port 5173' : 'npm run dev -- --port 5173',
    url: `http://localhost:5173`,
    reuseExistingServer: !worker && !process.env.CI,
    timeout: 120000,
  },
});
