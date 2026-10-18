import { createClient } from "@supabase/supabase-js";
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import postgres from "postgres";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

// A 1x1 PNG: the browser turns it into a JPEG before it is uploaded.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

/** The app's own database role cannot remove other people's rows, the migration connection can (via private.exec). */
async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}
async function removeStored(path: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  await supabase.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL!, password: process.env.TEST_USER_PASSWORD! });
  await supabase.storage.from("files").remove([path]);
}

test.describe("chats with replies, files and polls", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection for cleaning up");
  test.describe.configure({ mode: "serial" });

  test("an answer quotes the message, a photo and a poll are sent, and only people in the chat can open the photo", async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race in the same chat");
    const marker = `Antworttest ${Date.now()}`;
    let stored: string | null = null;
    try {
      await login(page);
      await page.goto("/connect?f=chats");
      await page.getByRole("link", { name: /Felix Wolf/ }).first().click();
      const log = page.getByRole("log");
      await expect(log).toBeVisible();

      // Reply to the first message.
      const original = (await log.locator("span.whitespace-pre-line").first().innerText()).trim();
      await log.getByRole("button", { name: "Antworten", exact: true }).first().click();
      await expect(page.getByText(/^Antwort an /)).toBeVisible();

      // A photo and a poll.
      await page.locator("form input[type=file]").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByText("foto.jpg")).toBeVisible();
      await page.getByRole("button", { name: "Umfrage erstellen" }).click();
      await page.getByLabel("Frage der Umfrage").fill("Wann passt es?");
      await page.getByLabel("Antwort 1").fill("Samstag");
      await page.getByLabel("Antwort 2").fill("Sonntag");
      await page.getByLabel("Nachricht schreiben").fill(marker);
      await page.getByRole("button", { name: "Senden", exact: true }).click();

      const bubble = log.locator("[id^=msg-]", { hasText: marker });
      await expect(bubble).toBeVisible();
      await expect(bubble.getByRole("button", { name: "Zur Nachricht springen" })).toContainText(original.slice(0, 20));
      const photo = bubble.locator("img[src^='/api/files/']");
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);

      // Voting in the poll.
      const poll = bubble.getByRole("region", { name: /Umfrage: Wann passt es/ });
      await poll.getByRole("radio", { name: /Samstag/ }).click();
      await expect(poll.getByRole("radio", { name: /Samstag/ })).toHaveAttribute("aria-checked", "true");
      await expect(poll.getByText("100 %").first()).toBeVisible();

      // The file is only handed out to someone who may read the chat.
      const src = (await photo.getAttribute("src"))!;
      const mine = await page.request.get(src, { maxRedirects: 0 });
      expect(mine.status()).toBe(302);
      const where = mine.headers()["location"];
      expect(where).toContain("/object/sign/files/");
      stored = decodeURIComponent(where.split("/object/sign/files/")[1].split("?")[0]);
      const guest = await pwRequest.newContext({ baseURL });
      expect((await guest.get(src, { maxRedirects: 0 })).status()).toBe(404);
      await guest.dispose();
    } finally {
      await exec(`delete from public.messages where body = '${marker}'`);
      if (stored) await removeStored(stored);
    }
  });

  test("a marketplace post can carry a poll that keeps its votes", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race on the same post");
    const marker = `Umfragetest ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/connect?c=market");
      await page.getByPlaceholder(/Neues im Viertel/).fill(marker);
      await page.getByRole("button", { name: "Umfrage erstellen" }).first().click();
      await page.getByLabel("Frage der Umfrage").fill("Welcher Tag?");
      await page.getByLabel("Antwort 1").fill("Montag");
      await page.getByLabel("Antwort 2").fill("Dienstag");
      await page.getByRole("button", { name: "Posten" }).click();
      const post = page.locator("article", { hasText: marker });
      await expect(post).toBeVisible();
      await post.getByRole("radio", { name: /Dienstag/ }).click();
      await expect(post.getByRole("radio", { name: /Dienstag/ })).toHaveAttribute("aria-checked", "true");
      await page.waitForTimeout(1500);
      await page.reload();
      await expect(page.locator("article", { hasText: marker }).getByRole("radio", { name: /Dienstag/ })).toHaveAttribute("aria-checked", "true");
    } finally {
      await exec(`delete from public.posts where body = '${marker}'`);
    }
  });
});
