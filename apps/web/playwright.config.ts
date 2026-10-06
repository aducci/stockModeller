// End-to-end tests: the built web app (vite preview) against a real API server and database.
// Needs DATABASE_URL. PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled Chromium where Playwright's own
// download is not available.
import { defineConfig } from "@playwright/test";

const apiPort = process.env.E2E_API_PORT ?? "3100";
const webPort = process.env.E2E_WEB_PORT ?? "4173";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: "node --import tsx e2e/server.ts",
      url: `http://127.0.0.1:${apiPort}/healthz`,
      env: { E2E_API_PORT: apiPort },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `vite build && vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      env: { CONNECTOME_API: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
