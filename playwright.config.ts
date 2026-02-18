import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  use: {
    headless: true
  },
  outputDir: './test-results'
});
