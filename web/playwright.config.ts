import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? (process.env.E2E_MODE === "demo" ? "http://localhost:3001" : "https://otter.local");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 45_000,
  fullyParallel: false,
  workers: process.env.E2E_MODE === "demo" ? 1 : undefined,
  globalTeardown: process.env.E2E_MODE === "demo" ? "./global-teardown.ts" : undefined,
  retries: 0,
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], viewport: { width: 844, height: 390 }, channel: "chrome" } },
  ],
  ...(process.env.E2E_MODE === "demo" ? {
    webServer: { command: "node server/dist/demo-server.js", cwd: "..", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
  } : {}),
});
