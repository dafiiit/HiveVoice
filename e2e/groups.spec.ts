import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("groups: ownership, invitations, rules", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");

  test("the founder owns the group, invites by link, changes rules (logged) and schedules deletion", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(240_000);
    const marker = `Testgruppe ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/new/group");
      await page.getByLabel("Name", { exact: false }).first().fill(marker);
      await page.getByRole("radiogroup", { name: "Wie arbeitet die Gruppe?" }).getByRole("radio", { name: /Verein/ }).click();
      await page.getByRole("button", { name: "Gruppe gründen", exact: true }).click();
      // Public groups ask for the real name; an account that went anonymous cannot found one (the mode changes once a month only).
      const needsName = page.getByText("Dafür brauchst du deinen Klarnamen");
      await Promise.race([page.waitForURL(/\/groups\/[a-z0-9-]+$/, { timeout: 30_000 }), needsName.waitFor({ timeout: 30_000 })]).catch(() => undefined);
      test.skip(await needsName.isVisible(), "the test account appears under a pseudonym right now");
      await expect(page).toHaveURL(/\/groups\/[a-z0-9-]+$/, { timeout: 30_000 });
      const groupUrl = page.url();

      await page.goto(`${groupUrl}?tab=team`);
      await expect(page.getByText(/^Eigentümer:in: /)).toBeVisible();

      // An invitation link, seen by a guest.
      await page.getByRole("button", { name: "Link erstellen" }).click();
      const link = await page.getByLabel("Einladungslink").inputValue();
      expect(link).toMatch(/\/join\/[0-9a-f]{32}$/);
      // Let the list refresh finish before a second browser asks for the same server (the dev server stalls on three parallel renders).
      await expect(page.getByRole("button", { name: "Widerrufen" }).first()).toBeVisible({ timeout: 60_000 });
      const guest = await browser.newContext();
      const gp = await guest.newPage();
      await gp.goto(link);
      await expect(gp.getByRole("heading", { name: "Einladung", level: 1 })).toBeVisible();
      await expect(gp.getByText(`Du wurdest in die Gruppe „${marker}“ eingeladen.`)).toBeVisible();
      await expect(gp.getByRole("link", { name: "Anmelden und beitreten" })).toBeVisible();
      await page.getByRole("button", { name: "Widerrufen" }).first().click();
      await expect(page.getByText("Keine aktiven Links.")).toBeVisible({ timeout: 20_000 });
      await gp.reload();
      await expect(gp.getByText("Der Link wurde zurückgezogen.")).toBeVisible();
      await guest.close();

      // A rule change shows up in the log.
      await page.getByRole("radio", { name: "Geheim, nur auf Einladung" }).click();
      await expect(page.getByRole("radio", { name: "Geheim, nur auf Einladung" })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
      await page.reload();
      await expect(page.getByText(/Regeln geändert/).first()).toBeVisible({ timeout: 30_000 });

      // Deletion is scheduled, with a date, and can be cancelled.
      await page.getByRole("button", { name: "Löschen vormerken" }).click();
      await expect(page.getByText(/Wird am .* gelöscht\./)).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Löschen abbrechen" }).click();
      await expect(page.getByRole("button", { name: "Löschen vormerken" })).toBeVisible({ timeout: 20_000 });
    } finally {
      await exec(`delete from public.groups where name = '${marker}'`);
      await exec(`delete from public.action_log where action in ('group_create', 'group_invite') and at > now() - interval '2 hours'`);
    }
  });

  test("a group name that is reserved for public bodies is refused", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(120_000);
    await login(page);
    await page.goto("/new/group");
    await page.getByLabel("Name", { exact: false }).first().fill("Stadt Testhausen Aktiv");
    await page.getByRole("button", { name: "Gruppe gründen", exact: true }).click();
    await expect(page.getByText("Dieser Name ist Behörden und Parteien vorbehalten.")).toBeVisible();
    await exec(`delete from public.action_log where action = 'group_create' and at > now() - interval '2 hours'`);
  });
});
