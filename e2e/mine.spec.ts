import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;
// The service worker only runs in a production build (next start), not in next dev.
const production = !!process.env.E2E_BASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("Ich: my own things", () => {
  test.skip(!signedIn, "needs a test account");

  test("is in the navigation and lists what one created", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /^Ich/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("heading", { name: "Meine Inhalte" })).toBeVisible();
    await page.getByRole("navigation", { name: "Meine Bereiche" }).getByRole("link", { name: "Notizen" }).click();
    await expect(page).toHaveURL(/f=notes/);
  });

  test("a new list is private, items can be added, ticked and removed, and the list deleted", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    const name = `Liste ${Date.now()}`;
    await login(page);
    await page.goto("/me");
    await page.getByRole("button", { name: "Liste" }).click();
    await page.getByLabel("Name der Liste").fill(name);
    await page.getByRole("button", { name: "Anlegen" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Nur du siehst diese Liste.")).toBeVisible();

    await page.getByLabel("Neuen Punkt hinzufügen").fill("Brot kaufen");
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(page.getByRole("checkbox", { name: "Brot kaufen" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Brot kaufen" })).toBeEnabled();
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("checkbox", { name: "Brot kaufen" }).check()]);
    await expect(page.getByRole("heading", { name: /Erledigt · 1/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Brot kaufen" })).toBeChecked();

    await page.goto("/me?f=lists");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("Privat");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Liste löschen" }).click();
    await page.getByRole("button", { name: "Ja", exact: true }).click();
    await expect(page).toHaveURL(/f=lists/);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  });

  test("new documents are private unless written for a group", async ({ page }) => {
    await login(page);
    await page.goto("/new/link?mode=note");
    await expect(page.getByRole("heading", { name: "Neue Notiz" })).toBeVisible();
    await expect(page.getByLabel("Wer darf das sehen?")).toHaveValue("me");
  });

  test("old links to notes and documents in the settings lead here", async ({ page }) => {
    await login(page);
    await page.goto("/settings?tab=docs");
    await expect(page).toHaveURL(/\/me\?f=docs/);
  });
});

test.describe("offline", () => {
  test.skip(!signedIn || !migrator || !production, "needs a test account, the migration connection and a production build (E2E_BASE_URL)");

  test("a chat stays readable offline and a message written offline goes out once back online", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    const marker = `Offlinetest ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/friends?f=chats");
      await page.getByRole("link", { name: /Felix Wolf/ }).first().click();
      await expect(page.getByRole("log")).toBeVisible();
      const url = page.url();
      // The first visit installs the service worker; the next load is controlled by it and keeps the page.
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await page.reload();
      await expect(page.getByRole("log")).toBeVisible();

      await context.setOffline(true);
      await expect(page.getByText(/^Offline/)).toBeVisible();
      await page.getByLabel("Nachricht schreiben").fill(marker);
      await page.getByRole("button", { name: "Senden", exact: true }).click();
      const bubble = page.getByRole("log").getByText(marker);
      await expect(bubble).toBeVisible();
      await expect(page.getByRole("log").getByText("Wartet auf Verbindung")).toBeVisible();

      // Reloading without a connection shows the kept page, with the waiting message.
      await page.goto(url);
      await expect(page.getByRole("log")).toBeVisible();
      await expect(page.getByRole("log").getByText(marker)).toBeVisible();

      // Another section opened earlier stays readable too.
      await page.getByRole("link", { name: /^Ich/ }).filter({ visible: true }).first().click();
      await expect(page.getByRole("heading", { name: "Meine Inhalte" })).toBeVisible();
      await page.goto(url);

      await context.setOffline(false);
      await expect(page.getByRole("log").getByText("Wartet auf Verbindung")).toHaveCount(0, { timeout: 20_000 });
      await page.reload();
      await expect(page.getByRole("log").getByText(marker)).toHaveCount(1);
    } finally {
      await context.setOffline(false);
      await exec(`delete from public.messages where body = '${marker}'`);
    }
  });
});
