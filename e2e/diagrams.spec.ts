import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test.describe("diagrams (draw.io) @writes", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");
  // draw.io hides its shape palette when its frame is narrow.
  test.use({ viewport: { width: 1600, height: 900 } });

  test("a diagram is drawn in draw.io, saved, shown as a picture and opens again", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(240_000);
    const marker = `E2E Diagramm ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/me/diagrams");
      await page.getByRole("link", { name: "Diagramm", exact: true }).first().click();
      await page.waitForURL(/\/me\/diagrams\/new$/);
      await page.getByLabel("Name des Diagramms").fill(marker);

      // One shape from draw.io's own palette, then our save button.
      const editor = page.frameLocator("iframe[title='draw.io-Editor']");
      await editor.locator(".geSidebar a.geItem").first().click({ timeout: 90_000 });
      await expect(page.getByText("Ungespeicherte Änderungen.")).toBeVisible();
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByText("Gespeichert, neue Version angelegt.")).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveURL(/\/me\/diagrams\/[0-9a-f-]{36}\?edit=1$/);

      await page.getByRole("button", { name: "Schließen" }).click();
      await page.waitForURL(/\/me\/diagrams\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: marker, level: 1 })).toBeVisible();
      const picture = page.getByRole("img", { name: marker });
      await expect(picture).toBeVisible();
      expect(await picture.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
      await expect(page.getByRole("link", { name: marker })).toBeVisible();

      // Opening it again loads the saved drawing into draw.io.
      await page.getByRole("link", { name: "Bearbeiten" }).click();
      await expect(editor.locator(".geDiagramContainer svg g g").first()).toBeAttached({ timeout: 90_000 });
      await expect(page.getByLabel("Name des Diagramms")).toHaveValue(marker);
    } finally {
      await exec(`delete from public.resources where title = '${marker}'`);
    }
  });
});
