import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("nothing typed is lost", () => {
  test.skip(!signedIn, "needs a test account");

  test("a note written offline stays on the device and is saved once the connection is back", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop" || !migrator, "writes data, and needs the migration connection for cleaning up");
    const marker = `E2E Offline ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/me/notes/new");
      await page.waitForSelector(".cm-content");
      await context.setOffline(true);
      await page.getByLabel("Titel", { exact: true }).fill(marker);
      await page.getByLabel("Inhalt in Markdown").fill("Noch nicht gesendet");
      await expect(page.getByText(/Du bist offline/)).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hv-draft:note:")).length), "kept on the device").toBe(1);
      await context.setOffline(false);
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 45_000 });
      await page.goto("/me/notes");
      await expect(page.getByRole("link", { name: new RegExp(marker) })).toBeVisible();
    } finally {
      await exec(`delete from public.resources where title = '${marker}'`);
    }
  });

  test("a note being changed saves itself, into the same version", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.skip(!migrator, "needs the migration connection");
    test.setTimeout(120_000);
    const marker = `E2E Autosave ${Date.now()}`;
    const email = process.env.TEST_USER_EMAIL!.replace(/'/g, "''");
    try {
      await exec(`
        insert into public.resources (owner_id, url, host, provider, kind, origin, title, body_md, preview, safety, visibility)
        select p.id, null, 'hivevoice', 'note', 'note', 'note', '${marker}', 'Erste Fassung', '{}'::jsonb, 'trusted', 'me'
        from public.profiles p join auth.users u on u.id = p.auth_user_id where u.email = '${email}'`);
      await login(page);
      await page.goto("/me/notes");
      await page.getByRole("link", { name: new RegExp(marker) }).first().click();
      // The note is the editor: there is nothing to open and nothing to save.
      const text = page.getByLabel("Inhalt in Markdown");
      await text.fill("Zweite Fassung, ohne auf Speichern zu drücken");
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 30_000 });
      await text.fill("Dritte Fassung, ohne auf Speichern zu drücken");
      const view = page.url().split("?")[0];
      await expect.poll(async () => (await page.request.get(view)).text(), { timeout: 30_000 }).toContain("Dritte Fassung");
      // Leaving the page without saving: the text is there, and both pauses went into the note's first version.
      await page.goto(view);
      await expect(page.getByText("Dritte Fassung, ohne auf Speichern zu drücken")).toBeVisible();
      await expect(page.getByText("Version 1", { exact: false })).toBeVisible();
    } finally {
      await exec(`delete from public.resources where title = '${marker}'`);
    }
  });
});
