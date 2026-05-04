import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  testDir: './playwright/tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3000',
    screenshot: 'off',
    video: 'off',
    trace: 'on-first-retry',
    storageState: fs.existsSync(path.resolve('playwright/.auth/state.json'))
      ? 'playwright/.auth/state.json'
      : undefined,
  },
});
