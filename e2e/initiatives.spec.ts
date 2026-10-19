import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}
async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("initiatives: authors and rights", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");

  test("the lead sees the author tools and can delete an initiative nobody has touched", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(240_000);
    const marker = `E2E Initiative ${Date.now()}`;
    const email = process.env.TEST_USER_EMAIL!.replace(/'/g, "''");
    try {
      await exec(`
        with me as (select p.id from public.profiles p join auth.users u on u.id = p.auth_user_id where u.email = '${email}'),
        ins as (
          insert into public.initiatives (title, summary, body, region_id, created_by, lead_id, published_at)
          select '${marker}', 'Kurz', 'Ein Text für den Test der Autorenwerkzeuge.', (select id from public.regions where level = 'borough' limit 1), me.id, me.id, now() from me
          returning id)
        insert into public.initiative_authors (initiative_id, profile_id) select ins.id, me.id from ins, me`);
      await login(page);
      await page.goto("/explore");
      await page.goto("/me");
      const href = await page.getByRole("link", { name: marker }).first().getAttribute("href");
      expect(href).toMatch(/^\/initiatives\/[0-9a-f-]{36}$/);
      await page.goto(href!);
      await expect(page.getByRole("heading", { name: marker, level: 1 })).toBeVisible();
      await expect(page.getByText("Du bist Autor:in")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Autor:innen", level: 2 })).toBeVisible();
      await expect(page.getByText("Leitung", { exact: true })).toBeVisible();
      await expect(page.getByText("Mit-Autor:in einladen")).toBeVisible();
      await expect(page.getByText(/Löschen geht nur, solange noch niemand/)).toBeVisible();

      // Searching for a co-author needs three letters; fewer ask for nothing.
      await page.getByRole("searchbox", { name: /Name suchen/ }).fill("zz");
      await expect(page.getByText("Niemand gefunden")).toHaveCount(0);

      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Löschen", exact: true }).click();
      await expect(page).toHaveURL(/\/me/, { timeout: 60_000 });
      const gone = await page.request.get(href!);
      expect(gone.status()).toBe(404);
    } finally {
      await exec(`delete from public.initiatives where title = '${marker}'`);
      await exec(`delete from public.action_log where action = 'initiative_create' and at > now() - interval '2 hours'`);
    }
  });
});
