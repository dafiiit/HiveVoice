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

test.describe("documents: who sees what", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");

  test("a link-only document opens with the link, closes without it, and the trash hides it", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(240_000);
    const marker = `E2E Dokument ${Date.now()}`;
    const email = process.env.TEST_USER_EMAIL!.replace(/'/g, "''");
    try {
      await exec(`
        insert into public.resources (owner_id, url, host, provider, kind, origin, title, body_md, preview, safety, visibility, license)
        select p.id, null, 'hivevoice', 'note', 'note', 'note', '${marker}', E'# Test\\nNur für den Link.', '{}'::jsonb, 'trusted', 'me', 'cc_by_sa'
        from public.profiles p join auth.users u on u.id = p.auth_user_id where u.email = '${email}'`);
      await login(page);
      await page.goto("/me?tab=docs");
      const href = await page.getByRole("link", { name: new RegExp(marker) }).first().getAttribute("href");
      expect(href).toMatch(/^\/links\/[0-9a-f-]{36}$/);
      await page.goto(href!);
      await expect(page.getByText("Nur du siehst dieses Dokument.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Rechte und Teilen", level: 2 })).toBeVisible();

      // Only with the link.
      await page.getByLabel("Wer darf das sehen?").selectOption("link");
      await page.getByRole("button", { name: "Einstellungen speichern" }).click();
      const link = await page.getByLabel("Link zum Weitergeben").inputValue({ timeout: 60_000 });
      expect(link).toMatch(/\/links\/[0-9a-f-]{36}\?k=[0-9a-f]{32}$/);
      const guest = await browser.newContext();
      const gp = await guest.newPage();
      await gp.goto(link);
      await expect(gp.getByRole("heading", { name: marker, level: 1 })).toBeVisible();
      await expect(gp.getByText("Du siehst dieses Dokument über einen geteilten Link.")).toBeVisible();
      const bare = await gp.request.get(new URL(href!, link).toString());
      expect(bare.status()).toBe(404);

      // Into the trash: closed for everybody else, restorable.
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "In den Papierkorb" }).click();
      await expect(page).toHaveURL(/tab=docs/, { timeout: 60_000 });
      await expect(page.getByText(marker)).toBeVisible();
      await gp.reload();
      await expect(gp.getByRole("heading", { name: marker, level: 1 })).toHaveCount(0);
      await page.getByRole("button", { name: "Wiederherstellen" }).first().click();
      await expect(page.getByRole("button", { name: "Wiederherstellen" })).toHaveCount(0, { timeout: 60_000 });
      await guest.close();
    } finally {
      await exec(`delete from public.resources where title = '${marker}'`);
      await exec(`delete from public.audit_log where action = 'resource_access' and created_at > now() - interval '2 hours' and object_type = 'resource' and not exists (select 1 from public.resources r where r.id = object_id)`);
    }
  });
});
