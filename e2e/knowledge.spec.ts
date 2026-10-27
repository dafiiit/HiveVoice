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

  test("a note is written in its finished look, with a Mermaid diagram and a formula, and keeps itself", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race");
    const marker = `Notiztest ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/new/link?mode=note");
      await page.getByLabel("Titel", { exact: true }).fill(marker);
      await page.getByLabel("Inhalt in Markdown").fill("# Hauptteil\n\nText mit **fett** und einer Liste:\n\n- eins\n- zwei\n\n```mermaid\nflowchart LR\n  A[Idee] --> B[Gruppe]\n```\n\nFormel $a^2+b^2=c^2$\n");
      // The text is drawn as it will look; the signs of the Markdown stay out of the way.
      const editor = page.locator(".cm-content");
      await expect(editor.locator(".katex").first()).toBeVisible({ timeout: 20_000 });
      await expect(editor.locator(".cm-h1")).toHaveText("Hauptteil");
      await expect(editor.locator(".cm-strong")).toHaveText("fett");
      await expect(editor.locator(".cm-mermaid .md-diagram svg")).toBeVisible({ timeout: 20_000 });
      await expect(editor).not.toContainText("**");
      // It keeps itself, private, at its own address.
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/me\/notes\/[0-9a-f-]{36}$/);

      // The plain text is one click away, and changing it changes the note.
      await page.getByRole("radio", { name: "Quelltext" }).click();
      await expect(editor).toContainText("**fett**");
      await editor.fill("# Neu gefasst\n\nGeändert.");
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });
      await page.reload();
      await page.getByRole("radio", { name: "Dargestellt" }).click();
      await expect(page.locator(".cm-content .cm-h1")).toHaveText("Neu gefasst");

      // It is listed under Ich → Notizen.
      await page.goto("/me/notes");
      await expect(page.getByText(marker).first()).toBeVisible();
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
      await expect(page.getByRole("status")).toContainText("ist jetzt eine Notiz");
      await page.getByRole("radio", { name: "Quelltext" }).click();
      await expect(page.getByLabel("Inhalt in Markdown")).toContainText("# Protokoll");
      await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("protokoll");
      await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 20_000 });

      // A photo.
      await page.getByRole("radio", { name: "Datei" }).click();
      await page.locator("input[type=file]").setInputFiles({ name: "skizze.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByText("skizze.jpg").first()).toBeVisible();
      await page.getByLabel("Titel", { exact: true }).fill(photoTitle);
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page).toHaveURL(/\/(links|me\/(notes|uploads))\/[0-9a-f-]{36}$/);
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
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page).toHaveURL(/\/(links|me\/(notes|uploads))\/[0-9a-f-]{36}$/);
      const open = page.getByRole("link", { name: "Datei öffnen" });
      await expect(open).toBeVisible();
      const pdf = await page.request.get((await open.getAttribute("href"))!, { maxRedirects: 0 });
      expect(pdf.status()).toBe(302);
      stored.push(decodeURIComponent(pdf.headers()["location"].split("/object/sign/files/")[1].split("?")[0]));
      // New files are private until shared: without an account the same address gives nothing.
      expect((await request.get((await open.getAttribute("href"))!, { maxRedirects: 0 })).status()).toBe(404);
    } finally {
      await exec(`delete from public.resources where title in ('${photoTitle}', '${pdfTitle}', 'protokoll')`);
      for (const path of stored) await removeStored(path);
    }
  });

  test("a photo can be drawn on before it is shared: rectangle and text, saved as a new file", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race");
    const stored = new Set<string>();
    page.on("request", (r) => {
      const m = r.method() === "POST" && r.url().match(/\/storage\/v1\/object\/files\/(.+)$/);
      if (m) stored.add(decodeURIComponent(m[1]));
    });
    try {
      await login(page);
      await page.goto("/new/link");
      await page.getByRole("radio", { name: "Datei" }).click();
      // A light grey photo, large enough to draw on.
      const grey = Buffer.from(await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 600; c.height = 400;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#dddddd"; ctx.fillRect(0, 0, 600, 400);
        return c.toDataURL("image/png").split(",")[1];
      }), "base64");
      await page.locator("input[type=file]").setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: grey });
      await expect(page.getByText("plan.jpg").first()).toBeVisible();
      const before = await page.getByRole("region", { name: "Hochgeladene Datei" }).locator("img").getAttribute("src");

      await page.getByRole("button", { name: "Bearbeiten" }).click();
      const editor = page.getByRole("dialog", { name: "Bild bearbeiten" });
      const save = editor.getByRole("button", { name: "Speichern" });
      await expect(save).toBeDisabled();
      const canvas = editor.locator("canvas");
      await expect(canvas).toBeVisible();
      const box = (await canvas.boundingBox())!;

      // A red rectangle (the default colour).
      await editor.getByRole("button", { name: "Rechteck" }).click();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
      await page.mouse.up();
      // Undo and redo it by drawing again keeps one mark.
      await editor.getByRole("button", { name: "Rückgängig" }).click();
      await expect(save).toBeDisabled();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
      await page.mouse.up();

      // Text in blue.
      await editor.getByRole("button", { name: "Farbe" }).click();
      await editor.getByRole("button", { name: "Blau" }).click();
      await editor.getByRole("button", { name: "Text", exact: true }).click();
      await canvas.click({ position: { x: box.width * 0.7, y: box.height * 0.85 } });
      await editor.getByRole("textbox", { name: "Text" }).fill("Hier");
      await save.click();
      await expect(editor).toBeHidden();

      // The preview now shows the drawing: red on the rectangle's edge, grey inside it.
      const img = page.getByRole("region", { name: "Hochgeladene Datei" }).locator("img");
      await expect(img).not.toHaveAttribute("src", before!);
      const pixel = (fx: number, fy: number) => img.evaluate(async (el, [x, y]) => {
        const i = el as HTMLImageElement;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.naturalWidth; c.height = i.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(i, 0, 0);
        return Array.from(ctx.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data.slice(0, 3));
      }, [fx, fy]);
      const [r, g, b] = await pixel(0.2, 0.45);
      expect(r).toBeGreaterThan(180);
      expect(g).toBeLessThan(80);
      expect(b).toBeLessThan(80);
      const [ir, ig] = await pixel(0.4, 0.45);
      expect(Math.abs(ir - ig)).toBeLessThan(20);
      // Edited before uploading twice: the photo went up again as a new file.
      expect(stored.size).toBe(2);
      await expect(page.getByText("plan.jpg").first()).toBeVisible();
    } finally {
      for (const path of stored) await removeStored(path);
    }
  });
});
