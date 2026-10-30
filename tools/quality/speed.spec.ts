import { expect, test } from "@playwright/test";
import { login } from "../../e2e/auth";
import { LOAD, SLOW } from "./limits";

const pages = ["/community", "/community/listings", "/friends", "/me", "/me/notes", "/me/calendar", "/settings"];
const VITALS = `(() => { const v = window.__vitals = { lcp: 0, blocking: 0 };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { v.lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { v.blocking += Math.max(0, e.duration - 50); })).observe({ type: "longtask", buffered: true }); })()`;

test.use({ serviceWorkers: "block" });

for (const path of pages) {
  test(`schnell: ${path} auf langsamem Netz, ohne Cache`, async ({ page }) => {
    await login(page);
    await page.addInitScript(VITALS);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: SLOW.latency, downloadThroughput: SLOW.down, uploadThroughput: SLOW.up });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW.cpu });
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const r = (await page.evaluate(`({ fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0, ...window.__vitals,
      bytes: performance.getEntriesByType("resource").reduce((s, e) => s + (e.encodedBodySize || 0), 0) })`)) as { fcp: number; lcp: number; blocking: number; bytes: number };
    console.log(`${path}: FCP ${Math.round(r.fcp)} ms, LCP ${Math.round(r.lcp)} ms, blockiert ${Math.round(r.blocking)} ms, ${Math.round(r.bytes / 1024)} KB`);
    expect.soft(r.fcp, "erster Inhalt").toBeGreaterThan(0);
    expect.soft(r.fcp, "erster Inhalt").toBeLessThan(LOAD.fcpMs);
    expect.soft(r.lcp, "größter Inhalt").toBeLessThan(LOAD.lcpMs);
    expect.soft(r.blocking, "blockierte Zeit").toBeLessThan(LOAD.blockingMs);
  });
}

test("schnell: Reiterwechsel auf langsamem Netz", async ({ page }) => {
  await login(page);
  await page.goto("/community");
  await page.waitForLoadState("networkidle").catch(() => {});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: SLOW.latency, downloadThroughput: SLOW.down, uploadThroughput: SLOW.up });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW.cpu });
  const start = Date.now();
  await page.getByRole("link", { name: "Anliegen", exact: true }).first().click();
  await page.waitForURL("**/community/listings");
  await page.locator("main input:visible").first().waitFor();
  const ms = Date.now() - start;
  console.log(`Reiterwechsel: ${ms} ms`);
  expect(ms).toBeLessThan(LOAD.tabMs);
});
