import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("calendar and duties @writes", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");

  test("a group plans a rehearsal with roles, answers it, runs a duty rota and serves it to calendar apps", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(300_000);
    const marker = `Kalender-Test ${Date.now()}`;
    const mate = randomUUID();
    try {
      await login(page);
      await page.goto("/new/group");
      await page.getByRole("radio", { name: /^WG/ }).click();
      await page.getByLabel("Name", { exact: false }).first().fill(marker);
      await page.getByRole("button", { name: "Gruppe gründen", exact: true }).click();
      await expect(page).toHaveURL(/\/(groups|friends\/g)\/[a-z0-9-]+$/, { timeout: 60_000 });
      const groupUrl = page.url().replace(/\?.*$/, "");
      await exec(`insert into public.group_members (group_id, profile_id, role)
        select g.id, app.ensure_profile('${mate}', 'Mitbewohnerin'), 'contributor' from public.groups g where g.name = '${marker}'`);

      await page.goto(`${groupUrl}?tab=calendar`);
      await expect(page.getByText("Noch keine Termine")).toBeVisible({ timeout: 60_000 });

      // A rehearsal tomorrow with two roles.
      await page.getByRole("button", { name: "Neuer Termin" }).click();
      const dialog = page.getByRole("dialog", { name: "Neuer Termin" });
      await dialog.getByLabel("Titel").fill("Probe");
      await dialog.getByRole("button", { name: "+ Rolle" }).click();
      await dialog.getByLabel("Rolle", { exact: true }).fill("Geige");
      await dialog.getByLabel("Anzahl").fill("2");
      await page.screenshot({ path: "test-results/calendar-form.png" });
      await dialog.getByRole("button", { name: "Eintragen" }).click();
      await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Probe", level: 1 })).toBeVisible();
      await expect(page.getByText("Geige: 2 fehlen")).toBeVisible();

      // Going, as a violin.
      await page.getByLabel("Als").selectOption({ label: "Geige" });
      await page.getByRole("button", { name: "Zusage", exact: true }).click();
      await expect(page.getByText("Du hast zugesagt")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Geige: 1 fehlt")).toBeVisible();
      await page.screenshot({ path: "test-results/calendar-event.png", fullPage: true });

      // A weekly duty, the two of us in turn; I tick mine off in the list.
      await page.goto(`${groupUrl}?tab=calendar`);
      await page.getByRole("button", { name: "Neuer Dienst" }).click();
      const d2 = page.getByRole("dialog", { name: "Neuer Dienst" });
      await d2.getByLabel("Titel").fill("Bad putzen");
      await d2.getByRole("button", { name: "Eintragen" }).click();
      await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Reihenfolge" })).toBeVisible();
      await page.goto(`${groupUrl}?tab=calendar`);
      await expect(page.getByText("Bad putzen").first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Du bist dran").first()).toBeVisible();
      await page.screenshot({ path: "test-results/calendar-group.png", fullPage: true });

      // My own calendar holds both, and the feed has them as iCal.
      await page.goto("/me/calendar");
      await expect(page.getByRole("link", { name: "Probe" })).toBeVisible({ timeout: 60_000 });
      const feed = await page.getByLabel("Kalender abonnieren").inputValue();
      const ics = await (await page.request.get(feed)).text();
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("SUMMARY:Probe");
      expect(ics).toContain("BEGIN:VALARM");
      await page.screenshot({ path: "test-results/calendar-mine.png", fullPage: true });
    } finally {
      await exec(`delete from public.notifications where (kind like 'event_%' or kind like 'duty_%') and payload ->> 'title' in ('Probe', 'Bad putzen')`);
      await exec(`delete from public.groups where name = '${marker}'`);
      await exec(`delete from public.profiles where auth_user_id = '${mate}'`);
      await exec(`delete from public.action_log where action in ('group_create', 'event') and at > now() - interval '2 hours'`);
    }
  });
});
