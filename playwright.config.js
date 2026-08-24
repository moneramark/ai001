import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: '**/*.spec.js',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['html', { open: 'never' }]],
});