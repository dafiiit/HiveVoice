import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// Screenshots of every view, for reviews (npm run screens). Not part of the test run.
export default defineConfig({
  testDir: ".",
  timeout: 15 * 60_000,
  workers: 1,
  outputDir: "../../test-results/screens",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "de-DE", actionTimeout: 8_000, navigationTimeout: 30_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
