import { expect, test } from "@playwright/test";

test("welcome page shows the hero and live initiatives", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Von der Idee");
  await expect(page.getByRole("link", { name: /Als Gast entdecken/ }).first()).toBeVisible();
});

test("guests can explore and read an initiative", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  const first = page.locator("article a[href^='/initiatives/']").filter({ hasText: /\w/ }).first();
  await first.click();
  await expect(page.getByRole("tablist", { name: /Bereiche der Initiative/ })).toBeVisible();
  await page.getByRole("tab", { name: /Argumente/ }).click();
  await expect(page.getByRole("heading", { name: /Pro ·/ })).toBeVisible();
});

test("the admin area is not reachable under its internal path", async ({ request }) => {
  const res = await request.get("/sysadmin");
  expect(res.status()).toBe(404);
});

test("with bot protection on, the login form waits for the check", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "no captcha configured");
  await page.goto("/login");
  await expect(page.locator('script[data-turnstile]')).toHaveCount(1);
});

test("a test account can sign in and reaches Verbinden", async ({ page }) => {
  test.skip(!process.env.TEST_USER_EMAIL, "TEST_USER_EMAIL not set");
  test.skip(!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "the captcha cannot be solved by a test browser; the other tests sign in through e2e/auth.ts");
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
  await expect(page.locator("main")).toBeVisible();
});
