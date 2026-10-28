import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// The review of the interface (npm run review): every page in five sizes, checked for overlaps, cut-off text, small targets,
// look-alike controls and errors, also after unfolding each menu. Not part of the test run; the report is
// test-results/review/report.md.
const size = (width: number, height: number) => ({ viewport: { width, height } });
export default defineConfig({
  testDir: ".",
  testMatch: "review.spec.ts",
  timeout: 20 * 60_000,
  workers: 2,
  reporter: "list",
  outputDir: "../../test-results/review-run",
  globalSetup: "../../e2e/global-setup.ts",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "de-DE", actionTimeout: 5_000, navigationTimeout: 30_000 },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], ...size(1440, 900) } },
    { name: "ipad-quer-1180", use: { ...devices["Desktop Chrome"], ...size(1180, 820) } },
    // Chromium for all (no extra browser to install), with the touch and size of each device.
    { name: "ipad-hoch-820", use: { ...devices["iPad (gen 7)"], ...size(820, 1180), browserName: "chromium" } },
    { name: "handy-390", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "handy-360", use: { ...devices["Galaxy S9+"], ...size(360, 740) } },
  ],
});
