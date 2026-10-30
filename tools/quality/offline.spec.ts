import { expect, test, type Page } from "@playwright/test";
import { login } from "../../e2e/auth";
import { OFFLINE } from "./limits";

// The service worker works in a production build only, and takes over on the second page.
const kept = ["/community", "/community/listings", "/friends", "/me", "/me/notes", "/me/calendar", "/settings"];

async function seen(page: Page) {
  await login(page);
  await page.goto("/me");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  for (const path of kept) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1800); // the app asks the worker to keep the page after 1.5 s
  }
}

const shown = (page: Page) => page.locator("main, h1").first().waitFor({ timeout: 20_000 });

test("offline: jede gesehene Seite öffnet sofort", async ({ page, context }) => {
  test.setTimeout(5 * 60_000);
  await seen(page);
  await context.setOffline(true);
  for (const path of kept) {
    const start = Date.now();
    await page.goto(path, { waitUntil: "commit" });
    await shown(page);
    const ms = Date.now() - start;
    console.log(`offline ${path}: ${ms} ms`);
    expect.soft(ms, `${path} ohne Netz`).toBeLessThan(OFFLINE.keptPageMs);
    expect.soft(await page.locator("body").innerText(), `${path} zeigt Inhalt`).not.toContain("ERR_");
    expect.soft(page.url(), `${path} bleibt die Seite`).toContain(path);
  }
});

test("schlechtes Netz: gesehene Seiten warten nicht auf den Server", async ({ page, context }) => {
  test.setTimeout(5 * 60_000);
  await seen(page);
  // Online, but nothing comes back: a train, a full cell, a captive portal.
  await context.route("**/*", (route) => (["document", "fetch"].includes(route.request().resourceType()) ? new Promise<void>(() => {}) : route.continue()));
  for (const path of kept) {
    const start = Date.now();
    const came = await page.goto(path, { waitUntil: "commit", timeout: 12_000 }).then(() => true, () => false);
    const ms = Date.now() - start;
    console.log(`schlechtes Netz ${path}: ${came ? `${ms} ms` : "kam nicht"}`);
    expect.soft(came, `${path} kommt bei hängendem Netz`).toBe(true);
    expect.soft(ms, `${path} bei hängendem Netz`).toBeLessThan(OFFLINE.badNetworkMs);
  }
});

test("offline: eine nie gesehene Seite sagt es sofort", async ({ page, context }) => {
  await seen(page);
  await context.setOffline(true);
  const start = Date.now();
  await page.goto("/principles", { waitUntil: "commit" });
  await page.locator("body").getByText(/offline|Verbindung|Internet/i).first().waitFor({ timeout: 10_000 });
  expect(Date.now() - start).toBeLessThan(OFFLINE.unknownPageMs);
});

test("offline: Klicks innerhalb der App bleiben nicht hängen", async ({ page, context }) => {
  await seen(page);
  await page.goto("/community");
  await page.waitForLoadState("networkidle").catch(() => {});
  await context.setOffline(true);
  const start = Date.now();
  await page.getByRole("link", { name: "Anliegen", exact: true }).first().click();
  await page.waitForURL("**/community/listings", { timeout: 10_000 });
  await shown(page);
  const ms = Date.now() - start;
  console.log(`offline Klick: ${ms} ms`);
  expect(ms).toBeLessThan(OFFLINE.clickMs);
});
