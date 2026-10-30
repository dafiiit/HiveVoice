import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
// Lets the "bad connection" test hold back what the service worker asks for too.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

// The hard limits of the app (npm run check, docs/qualitaet.md): animation, loading, offline. Against a production build.
export default defineConfig({
  testDir: ".",
  timeout: 3 * 60_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../../test-results/quality-run",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300", locale: "de-DE" },
  projects: [
    { name: "selftest", testMatch: "selftest.spec.ts", use: { ...devices["Pixel 7"] } },
    { name: "phone", testMatch: /(motion|speed|offline)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});
