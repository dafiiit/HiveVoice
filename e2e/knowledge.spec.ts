import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login, testClient } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}
async function removeStored(path: string) {
  const supabase = await testClient();
  await supabase.storage.from("files").remove([path]);
}

test.describe("knowledge: notes, files and images", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection for cleaning up");
  test.describe.configure({ mode: "serial" });

  test("a Markdown note has a live preview with a Mermaid diagram, can be published and edited", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race");
    const marker = `Notiztest ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/new/link");
      await page.getByRole("radio", { name: "Notiz" }).click();
      await page.getByLabel("Titel", { exact: true }).fill(marker);
      await page.getByLabel("Inhalt in Markdown").fill("# Hauptteil\n\nText mit **fett** und einer Liste:\n\n- eins\n- zwei\n\n```mermaid\nflowchart LR\n  A[Idee] --> B[Gruppe]\n```\n");
      const preview = page.getByRole("region", { name: "Vorschau" });
      await expect(preview.getByRole("heading", { name: "Hauptteil" })).toBeVisible();
      await expect(preview.getByText("fett")).toBeVisible();
      await expect(preview.getByRole("img", { name: "Diagramm" }).locator("svg")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Notiz veröffentlichen" }).click();
      await expect(page).toHaveURL(/\/links\/[0-9a-f-]{36}$/);
      const article = page.locator("article.border");
      await expect(article.getByRole("img", { name: "Diagramm" }).locator("svg")).toBeVisible({ timeout: 20_000 });
      await expect(article.getByRole("heading", { name: "Hauptteil" })).toBeVisible();

      // Edit it.
      await article.getByRole("link", { name: "Bearbeiten" }).click();
      await page.getByLabel("Inhalt in Markdown").fill("# Neu gefasst\n\nGeändert.");
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect(page).toHaveURL(/\/links\/[0-9a-f-]{36}$/);
      await expect(page.locator("article.border").getByRole("heading", { name: "Neu gefasst" })).toBeVisible();

      // Wissen finds a note by its text.
      await page.goto("/explore?kind=links&q=Neu+gefasst");
      await expect(page.getByRole("link", { name: marker })).toBeVisible();
    } finally {
      await exec(`delete from public.resources where title = '${marker}'`);
    }
  });

  test("a Markdown file becomes an editable note, a photo and a PDF are stored and opened through the app", async ({ page, request }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race");
    const photoTitle = `Fototest ${Date.now()}`, pdfTitle = `PDFtest ${Date.now()}`;
    const stored: string[] = [];
    try {
      await login(page);
      await page.goto("/new/link");
      await page.getByRole("radio", { name: "Datei" }).click();
      // Markdown goes to the editor.
      await page.locator("input[type=file]").setInputFiles({ name: "protokoll.md", mimeType: "text/markdown", buffer: Buffer.from("# Protokoll\n\n- Punkt A\n") });
      await expect(page.getByRole("status")).toContainText("steht jetzt als Notiz im Editor");
      await expect(page.getByLabel("Inhalt in Markdown")).toHaveValue(/# Protokoll/);
      await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("protokoll");

      // A photo.
      await page.getByRole("radio", { name: "Datei" }).click();
      await page.locator("input[type=file]").setInputFiles({ name: "skizze.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByText("skizze.jpg").first()).toBeVisible();
      await page.getByLabel("Titel", { exact: true }).fill(photoTitle);
      await page.getByRole("button", { name: "Teilen", exact: true }).click();
      await expect(page).toHaveURL(/\/links\/[0-9a-f-]{36}$/);
      const img = page.locator("main img[src^='/api/files/']");
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const res = await page.request.get((await img.getAttribute("src"))!, { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      stored.push(decodeURIComponent(res.headers()["location"].split("/object/sign/files/")[1].split("?")[0]));

      // A PDF.
      await page.goto("/new/link");
      await page.getByRole("radio", { name: "Datei" }).click();
      await page.locator("input[type=file]").setInputFiles({ name: "bericht.pdf", mimeType: "application/pdf", buffer: PDF });
      await expect(page.getByText("bericht.pdf").first()).toBeVisible();
      await page.getByLabel("Titel", { exact: true }).fill(pdfTitle);
      await page.getByRole("button", { name: "Teilen", exact: true }).click();
      await expect(page).toHaveURL(/\/links\/[0-9a-f-]{36}$/);
      const open = page.getByRole("link", { name: "Datei öffnen" });
      await expect(open).toBeVisible();
      const pdf = await page.request.get((await open.getAttribute("href"))!, { maxRedirects: 0 });
      expect(pdf.status()).toBe(302);
      stored.push(decodeURIComponent(pdf.headers()["location"].split("/object/sign/files/")[1].split("?")[0]));
      // Without an account the same address gives nothing for a file that is public: it is readable, so it redirects too.
      expect((await request.get((await open.getAttribute("href"))!, { maxRedirects: 0 })).status()).toBe(302);
    } finally {
      await exec(`delete from public.resources where title in ('${photoTitle}', '${pdfTitle}')`);
      for (const path of stored) await removeStored(path);
    }
  });
});
