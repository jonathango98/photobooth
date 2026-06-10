// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Per-test timeout — generous to accommodate the capture freeze window
  timeout: 30000,

  use: {
    baseURL: 'http://localhost:3000',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Provide a fake camera so getUserMedia() resolves without hardware
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],

  // Serve the static site from public/ during tests
  webServer: {
    command: 'npx serve public -l 3000 --no-clipboard',
    port: 3000,
    // In CI always spin up fresh; locally reuse if already running
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
