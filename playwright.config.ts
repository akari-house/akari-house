import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: "npm run test:e2e:serve",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
