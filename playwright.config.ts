import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  use: { viewport: { width: 1440, height: 900 }, headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
    args: ['--no-sandbox'],
  } } }],
});
