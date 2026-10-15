import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const signedIn = !!process.env.TEST_USER_EMAIL;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

// A 1x1 PNG, enough to exercise the upload path.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("the design is light unless someone picks dark", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 244, 244)");
});

test.describe("signed in", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("navigation has no 'Für mich' and no 'Wer ist zuständig?' entry", async ({ page }, info) => {
    await login(page);
    await page.goto("/connect");
    const nav = info.project.name === "mobile" ? page.locator("nav").last() : page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav).toContainText("Verbinden");
    await expect(nav).not.toContainText("Für mich");
    await expect(nav).not.toContainText("zuständig");
    // The profile stays one tap away in the corner.
    await expect(page.getByRole("link", { name: /^Für mich – / })).toBeVisible();
  });

  test("Verbinden lists chats and everything I sent or must answer", async ({ page }) => {
    await login(page);
    await page.goto("/connect");
    await expect(page.getByRole("link", { name: "Gruppe gründen" }).first()).toBeVisible();
    await page.getByRole("link", { name: /^Chats/ }).click();
    const chat = page.getByRole("link", { name: /Lea Hofmann|Felix Wolf|Ali Rahimi/ }).first();
    await expect(chat).toBeVisible();
    await chat.click();
    await expect(page.getByRole("log")).toBeVisible();
    await expect(page.getByLabel("Nachricht schreiben")).toBeEnabled();
    await page.goto("/connect?f=requests");
    await expect(page.getByRole("region", { name: "Unterhaltungen" }).getByRole("link").first()).toBeVisible();
  });

  test("the group form is reachable from Verbinden", async ({ page }) => {
    await login(page);
    await page.goto("/connect");
    await page.getByRole("link", { name: "Gruppe gründen" }).first().click();
    await expect(page).toHaveURL(/\/new\/group/);
  });

  test("tag ideas run in a carousel", async ({ page }) => {
    await login(page);
    await page.goto("/me");
    const next = page.getByRole("button", { name: "Weiter blättern" }).first();
    await expect(next).toBeVisible();
    const track = page.getByRole("group", { name: /Was ich anbiete · Ideen/ });
    const before = await track.evaluate((el) => el.scrollLeft);
    await next.click({ timeout: 8000 });
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  });

  test("a profile photo can be uploaded and removed", async ({ page }) => {
    await login(page);
    await page.goto("/me");
    test.skip(await page.getByRole("button", { name: "Foto entfernen" }).isVisible(), "this account already has a photo; leave it alone");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    const avatar = page.locator('main img[width="120"]');
    await expect(avatar).toBeVisible({ timeout: 20_000 });
    const src = await avatar.getAttribute("src");
    expect(src).toMatch(/\/storage\/v1\/object\/public\/images\/[0-9a-f-]{36}\/[0-9a-f]+\.jpg$/);
    expect((await page.request.get(src!)).status()).toBe(200);
    await page.getByRole("button", { name: "Foto entfernen" }).click();
    await expect(page.getByRole("button", { name: "Foto hochladen" })).toBeVisible();
    // Do not leave the file behind in storage.
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    await sb.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL!, password: process.env.TEST_USER_PASSWORD! });
    await sb.storage.from("images").remove([src!.split("/images/")[1]]);
  });
});

test.describe("language without signing in", () => {
  test.use({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } });

  test("German is the default, even for an English browser", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Von der Idee");
  });

  test("guests can switch the language on the welcome page and keep it while reading the app", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sprache wählen/ }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("From an idea");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The choice survives navigation and reloads, also without an account.
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
    // And back to German from inside the app.
    await page.getByRole("button", { name: /Choose language/ }).click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  });
});
