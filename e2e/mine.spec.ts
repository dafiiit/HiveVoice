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
    await page.getByRole("link", { name: "Notizen" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/me\/notes/);
  });

  test("a new list is a private note: items are added, ticked and removed, and it shows under notes with tasks", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" || !migrator, "writes data, and needs the migration connection for cleaning up");
    const name = `Liste ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/new");
      await page.getByRole("link", { name: /^Liste/ }).click();
      await expect(page).toHaveURL(/\/me\/notes\/new\?list=1/);
      await expect(page.getByRole("radio", { name: "Liste" })).toBeChecked();
      await page.getByLabel("Titel", { exact: true }).fill(name);
      await page.getByLabel("Neuen Punkt hinzufügen").fill("Brot kaufen");
      await page.getByRole("button", { name: "Hinzufügen" }).click();
      await page.getByLabel("Neuen Punkt hinzufügen").fill("Milch");
      await page.getByRole("button", { name: "Hinzufügen" }).click();
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });
      // The note exists now, at its own address, and is private.
      await expect(page).toHaveURL(/\/me\/notes\/[0-9a-f-]{36}$/);
      await page.getByRole("checkbox", { name: "Brot kaufen" }).click();
      await expect(page.getByText("1 von 2 erledigt")).toBeVisible();
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });
      await page.reload();
      // Mostly tasks: it opens as a list again, and the tick is still there.
      await expect(page.getByRole("checkbox", { name: "Brot kaufen" })).toBeChecked();
      await expect(page.getByRole("button", { name: "Teilen" }), "lists share like everything else").toBeVisible();

      await page.goto("/me/notes?f=tasks");
      await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("Privat");
      await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("1 von 2 erledigt");
      // The old address of lists leads to notes.
      await page.goto("/me/lists");
      await expect(page).toHaveURL(/\/me\/notes\?f=tasks/);
    } finally {
      await exec(`delete from public.resources where title = '${name}'`);
    }
  });

  test("a new note is private and keeps itself as soon as there is something to keep", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" || !migrator, "writes data, and needs the migration connection for cleaning up");
    const name = `Notiz ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/new/link?mode=note");
      await expect(page.getByLabel("Wer darf das sehen?"), "sharing is a later step").toHaveCount(0);
      await expect(page.getByRole("button", { name: /veröffentlichen/i })).toHaveCount(0);
      await page.getByLabel("Titel", { exact: true }).fill(name);
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });
      await page.goto("/me/notes");
      await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("Privat");
    } finally {
      await exec(`delete from public.resources where title = '${name}'`);
    }
  });

  test("old links to notes and documents in the settings lead here", async ({ page }) => {
    await login(page);
    await page.goto("/settings?tab=docs");
    await expect(page).toHaveURL(/\/me\/notes/);
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
      await page.getByRole("link", { name: /Mia Schuster/ }).first().click();
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
